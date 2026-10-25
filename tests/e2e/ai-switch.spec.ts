import { test, expect, type Page } from "@playwright/test";
import type { Lesson, ProviderInfo } from "../../lib/types";

const providerFixtures = (): ProviderInfo[] => [
  { id: "openai", name: "OpenAI", model: "mock-openai-vision", configured: true },
  { id: "gemini", name: "Google Gemini", model: "mock-gemini-vision", configured: true },
  { id: "anthropic", name: "Anthropic Claude", model: "mock-anthropic-vision", configured: false },
];

// Only provider responses are authored fixtures. All photos and the lesson are
// created through the real local API, then removed by their exact fixture ID.
// Configuration and processing POSTs are intercepted: no credentials are saved
// and no provider request can be started by these browser tests.
async function fixture(page: Page, completed = false) {
  const created = await page.request.post("/api/demo?fresh=true");
  expect(created.ok()).toBe(true);
  const { id } = (await created.json()) as { id: string };
  const actual = (await (await page.request.get(`/api/lessons/${id}`)).json()) as Lesson;
  let options = providerFixtures();
  let phase: Lesson["status"] = completed ? "COMPLETED" : "READY";
  const configurations: { provider: string; model?: string; apiKey?: string }[] = [];
  const processing: { provider: string; orderMode: string }[] = [];
  await page.route("**/api/providers", (route) => route.fulfill({ json: options }));
  await page.route("**/api/providers/configure", async (route) => {
    const input = route.request().postDataJSON() as (typeof configurations)[number];
    configurations.push(input);
    options = options.map((provider) => provider.id === input.provider
      ? { ...provider, configured: true, model: input.model || provider.model }
      : provider);
    await route.fulfill({ json: options });
  });
  await page.route(`**/api/lessons/${id}`, (route) => route.fulfill({
    json: { ...actual, isDemo: false, status: phase, document: completed ? actual.document : null, reconstruction: null },
  }));
  await page.route(`**/api/lessons/${id}/process`, async (route) => {
    processing.push(route.request().postDataJSON());
    phase = "ANALYZING";
    await route.fulfill({ status: 202, json: { runId: "mock-ai-switch-run", status: phase } });
  });
  return { id, configurations, processing };
}

test("change a configured provider and model without replacing its key, then retain the selection", async ({ page }) => {
  const saved = await fixture(page);
  try {
    await page.goto(`/lessons/${saved.id}`);
    await expect(page.getByLabel("Selected AI", { exact: true })).toContainText("OpenAI");
    await page.getByRole("button", { name: "Change AI", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Change AI", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Model", { exact: true })).toHaveValue("mock-openai-vision");
    await dialog.getByLabel("Provider", { exact: true }).selectOption("gemini");
    await expect(dialog.getByLabel("Model", { exact: true })).toHaveValue("mock-gemini-vision");
    await dialog.getByLabel("Model", { exact: true }).fill("mock-gemini-updated");
    await expect(dialog.getByLabel("API key", { exact: true })).toHaveValue("");
    await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(saved.configurations).toEqual([{ provider: "gemini", model: "mock-gemini-updated" }]);
    await expect(page.getByLabel("Selected AI", { exact: true })).toContainText("Google Gemini");
    await expect(page.getByLabel("Selected AI", { exact: true })).toContainText("mock-gemini-updated");
    expect(await page.evaluate(() => localStorage.getItem("boardreplay:ai-provider"))).toBe("gemini");
    await page.reload();
    await expect(page.getByLabel("Selected AI", { exact: true })).toContainText("Google Gemini");
    await expect(page.getByLabel("Selected AI", { exact: true })).toContainText("mock-gemini-updated");
    await page.getByRole("button", { name: "Organize lecture", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Analyzing photos/ })).toBeVisible();
    expect(saved.processing).toEqual([{ provider: "gemini", orderMode: "AUTO" }]);
  } finally {
    await fetch(`http://127.0.0.1:3000/api/lessons/${saved.id}`, { method: "DELETE" });
  }
});

test("connect a new provider and clear draft keys and models when switching providers", async ({ page }) => {
  const saved = await fixture(page);
  const fakeKey = "mock-browser-only-anthropic-key";
  try {
    await page.goto(`/lessons/${saved.id}`);
    await page.getByRole("button", { name: "Change AI", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Provider", { exact: true }).selectOption("anthropic");
    await expect(dialog.getByLabel("Model", { exact: true })).toHaveValue("mock-anthropic-vision");
    await expect(dialog.getByRole("button", { name: "Save connection", exact: true })).toBeDisabled();
    await dialog.getByLabel("API key", { exact: true }).fill(fakeKey);
    await dialog.getByLabel("Model", { exact: true }).fill("unsaved-anthropic-model");
    await dialog.getByLabel("Provider", { exact: true }).selectOption("gemini");
    await expect(dialog.getByLabel("API key", { exact: true })).toHaveValue("");
    await expect(dialog.getByLabel("Model", { exact: true })).toHaveValue("mock-gemini-vision");
    await dialog.getByLabel("Provider", { exact: true }).selectOption("anthropic");
    await expect(dialog.getByLabel("API key", { exact: true })).toHaveValue("");
    await expect(dialog.getByLabel("Model", { exact: true })).toHaveValue("mock-anthropic-vision");
    await dialog.getByLabel("API key", { exact: true }).fill(fakeKey);
    await dialog.getByLabel("Model", { exact: true }).fill("mock-anthropic-updated");
    await dialog.getByRole("button", { name: "Save connection", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(saved.configurations).toEqual([{ provider: "anthropic", model: "mock-anthropic-updated", apiKey: fakeKey }]);
    await expect(page.getByLabel("Selected AI", { exact: true })).toContainText("Anthropic Claude");
    expect(await page.evaluate(() => Object.values(localStorage).join(" "))).not.toContain(fakeKey);
    expect(await page.evaluate(() => Object.values(sessionStorage).join(" "))).not.toContain(fakeKey);
    await page.getByRole("button", { name: "Change AI", exact: true }).click();
    await expect(page.getByRole("dialog").getByLabel("API key", { exact: true })).toHaveValue("");
    expect(saved.processing).toEqual([]);
  } finally {
    await fetch(`http://127.0.0.1:3000/api/lessons/${saved.id}`, { method: "DELETE" });
  }
});

test("completed lessons expose Change AI without replacing the existing lecture document", async ({ page }) => {
  const saved = await fixture(page, true);
  try {
    await page.goto(`/lessons/${saved.id}`);
    await expect(page.getByTestId("lecture-document")).toBeVisible();
    await page.getByRole("button", { name: "Lesson options", exact: true }).click();
    await page.getByRole("button", { name: "Change AI", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Change AI", exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Provider", { exact: true }).selectOption("gemini");
    await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("lecture-document")).toBeVisible();
    expect(saved.configurations).toEqual([{ provider: "gemini", model: "mock-gemini-vision" }]);
    expect(saved.processing).toEqual([]);
  } finally {
    await fetch(`http://127.0.0.1:3000/api/lessons/${saved.id}`, { method: "DELETE" });
  }
});

