import { test, expect } from "@playwright/test";
import path from "node:path";

test("create a lesson, upload real images, arrange photographs, and delete it", async ({
  page,
}) => {
  let lessonId = "";
  try {
    await page.goto("/lessons/new");
    await page.getByLabel("Lesson name").fill(`Browser test ${Date.now()}`);
    await page.getByLabel("Course name").fill("Engineering Mathematics");
    await page
      .getByLabel("Topic", { exact: false })
      .fill("Completing the square");
    await page.getByRole("button", { name: "Continue to photos" }).click();
    await expect(page).toHaveURL(/\/lessons\/[^/]+$/);
    lessonId = page.url().split("/").pop()!;
    await page
      .locator('input[type="file"][multiple]')
      .setInputFiles(
        [1, 2, 3, 4].map((i) => path.resolve(`public/demo/frame-${i}.png`)),
      );
    await expect(page.locator(".upload-row")).toHaveCount(4);
    await expect(
      page.getByRole("button", { name: "Move photo 1 later" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Move photo 1 later" }).click();
    await expect(
      page.locator(".upload-row").first().locator("strong"),
    ).toHaveText("frame-2.png");
    await expect(
      page.getByRole("button", { name: "Rotate photo 1" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Rotate photo 1" }).click();
    await expect(page.locator(".upload-row").first()).toContainText("90°");
    await page.reload();
    await expect(page.locator(".upload-row").first()).toContainText(
      "frame-2.png",
    );
    await expect(page.locator(".upload-row").first()).toContainText("90°");
    const providers = (await (
      await page.request.get("/api/providers")
    ).json()) as { configured: boolean }[];
    if (!providers.some((p) => p.configured)) {
      await expect(
        page.getByRole("button", { name: "Reconstruct lesson" }),
      ).toBeDisabled();
      await expect(page.getByText("API key not configured")).toHaveCount(3);
    }
    await page.goto("/lessons");
    const card = page
      .locator(".lesson-card")
      .filter({ hasText: "Engineering Mathematics" })
      .filter({
        has: page.getByRole("link", { name: new RegExp(`Open Browser test`) }),
      })
      .first();
    await card.getByRole("button", { name: /^Delete / }).click();
    await page
      .getByRole("button", { name: "Delete lesson", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const response = await page.request.get(`/api/lessons/${lessonId}`);
    expect(response.status()).toBe(404);
    lessonId = "";
  } finally {
    if (lessonId) await page.request.delete(`/api/lessons/${lessonId}`);
  }
});

test("sample replay, evidence, persistent correction, restore, and print export", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Explore demo", exact: true }),
  ).toBeVisible();
  const demo = (await (
    await page.request.post("/api/demo?fresh=true")
  ).json()) as { id: string };
  await page.goto(`/lessons/${demo.id}`);
  await expect(page).toHaveURL(/\/lessons\/[^/]+$/);
  const id = page.url().split("/").pop()!;
  try {
    await expect(page.locator(".board-step")).toHaveCount(1);
    await expect(
      page.locator(".workspace-title-line .sample-label"),
    ).toHaveText("SAMPLE DATA");
    await page.getByRole("heading", { level: 1 }).click();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".board-step")).toHaveCount(2);
    await page.getByRole("button", { name: "Next step", exact: true }).click();
    await expect(page.locator(".board-step")).toHaveCount(3);
    await expect(page.locator(".source-head")).toContainText(
      "Board capture 02",
    );
    await expect(page.locator(".evidence-inspector")).toContainText(
      "Bundled synthetic sample",
    );
    await page.getByLabel("Playback speed").selectOption("2");
    await page
      .getByRole("button", { name: "Play replay", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Pause replay", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Pause replay", exact: true })
      .click();
    await page
      .locator(".board-step.active")
      .getByRole("button", { name: "Edit step", exact: true })
      .click();
    const correction = `Recognize the perfect square. Reviewed ${Date.now()}.`;
    await page.getByLabel("Text / Markdown").fill(correction);
    await page
      .getByRole("button", { name: "Save correction", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".board-step.active")).toContainText(correction);
    await page.reload();
    await page
      .getByRole("button", { name: "Show all steps", exact: true })
      .click();
    await expect(
      page.locator(".board-step").filter({ hasText: correction }),
    ).toContainText("User edited");
    await page.getByRole("button", { name: /Review revision history/ }).click();
    await page
      .locator(".revision-row")
      .first()
      .getByRole("button", { name: "Restore", exact: true })
      .click();
    await expect(page.locator(".modal-overlay")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Show all steps", exact: true })
      .click();
    await expect(
      page.locator(".board-step").filter({ hasText: correction }),
    ).toHaveCount(0);
    const popupPromise = context.waitForEvent("page");
    await page.getByRole("link", { name: "Export PDF", exact: true }).click();
    const printPage = await popupPromise;
    await expect(
      printPage.locator(".print-document .katex").first(),
    ).toBeVisible();
    await expect(
      printPage.getByRole("button", {
        name: "Print / Save as PDF",
        exact: true,
      }),
    ).toBeEnabled();
    await printPage.evaluate(() => {
      (window as unknown as { printCalled: boolean }).printCalled = false;
      window.print = () => {
        (window as unknown as { printCalled: boolean }).printCalled = true;
      };
    });
    await printPage.getByLabel("Include original photos").check();
    await expect(printPage.locator(".print-photo")).toHaveCount(4);
    await printPage
      .getByRole("button", { name: "Print / Save as PDF", exact: true })
      .click();
    await expect
      .poll(() =>
        printPage.evaluate(
          () => (window as unknown as { printCalled: boolean }).printCalled,
        ),
      )
      .toBe(true);
    await printPage.close();
  } finally {
    await page.request.delete(`/api/lessons/${id}`);
  }
});

test("mobile workspace tabs and responsive screens stay within the viewport", async ({
  page,
}) => {
  const result = (await (
    await page.request.post("/api/demo?fresh=true")
  ).json()) as { id: string };
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const url of [
      "/",
      "/lessons",
      "/lessons/new",
      `/lessons/${result.id}`,
    ]) {
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
        url,
      ).toBe(true);
    }
    await page.getByRole("button", { name: "Timeline", exact: true }).click();
    await expect(page.locator(".workspace-sidebar")).toBeVisible();
    await page
      .getByRole("button", { name: "Source & evidence", exact: true })
      .click();
    await expect(page.locator(".workspace-right")).toBeVisible();
    await expect(page.locator(".evidence-inspector")).toContainText(
      "Evidence inspector",
    );
    await page
      .getByRole("button", { name: "Digital board", exact: true })
      .click();
    await expect(page.locator(".workspace-center")).toBeVisible();
  } finally {
    await page.request.delete(`/api/lessons/${result.id}`);
  }
});
