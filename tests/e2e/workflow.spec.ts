import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { readFileSync } from "node:fs";

async function photoOption(page: Page, index: number, action: string) {
  const menu = page.locator(".upload-simple-photo-menu").nth(index - 1);
  if (!(await menu.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await page.getByLabel(`Photo ${index} options`, { exact: true }).click();
  }
  const name = ["earlier", "later"].includes(action) ? `Move photo ${index} ${action}` : `${action} photo ${index}`;
  await page.getByRole("button", { name, exact: true }).click();
}

test("upload from home, arrange real photos, and manage a saved lesson", async ({ page }) => {
  let lessonId = "";
  const title = `Browser test ${Date.now()}`;
  try {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /lecture photos.*organized study notes/i })).toBeVisible();
    await expect(page.getByLabel("Take a photo", { exact: true })).toHaveAttribute("capture", "environment");
    await page.getByLabel("Upload photos", { exact: true }).setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("This is not a photograph.") });
    await expect(page.getByRole("alert").filter({ hasText: "Choose JPG, PNG, or WebP photos." })).toBeVisible();
    const created = page.waitForResponse((response) => response.url().endsWith("/api/lessons") && response.request().method() === "POST");
    await page.getByLabel("Upload photos", { exact: true }).setInputFiles([1, 2, 3, 4].map((i) => path.resolve(`public/demo/frame-${i}.png`)));
    lessonId = ((await (await created).json()) as { id: string }).id;
    await expect(page).toHaveURL(new RegExp(`/lessons/${lessonId}$`), { timeout: 20000 });
    const photos = page.getByRole("list", { name: "Photo sequence" }).locator("li");
    await expect(photos).toHaveCount(4);
    await expect(page.getByRole("button", { name: "Organize lecture", exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "AI provider", exact: true })).toBeHidden();
    const transfer = await page.evaluateHandle((bytes) => {
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array(bytes)], "dropped-photo.png", { type: "image/png" }));
      return data;
    }, Array.from(readFileSync(path.resolve("public/demo/frame-5.png"))));
    await page.locator(".upload-simple-drop").dispatchEvent("drop", { dataTransfer: transfer });
    await expect(photos).toHaveCount(5);
    await photoOption(page, 5, "Remove");
    await expect(photos).toHaveCount(4);

    // Exercise the browser's actual HTML drag events and verify the persisted order.
    await photos.nth(0).dragTo(photos.nth(2));
    await expect(photos.first()).toContainText("frame-2.png");
    await expect(photos.nth(2)).toContainText("frame-1.png");
    await page.reload();
    await expect(photos.nth(2)).toContainText("frame-1.png");

    await photoOption(page, 1, "later");
    await expect(photos.first()).toContainText("frame-3.png");
    await photoOption(page, 2, "earlier");
    await expect(photos.first()).toContainText("frame-2.png");
    await photoOption(page, 1, "Rotate");
    await expect(photos.first().locator("img")).toHaveCSS("transform", "matrix(0, 1, -1, 0, 0, 0)");
    await photoOption(page, 4, "Remove");
    await expect(photos).toHaveCount(3);
    await page.reload();
    await expect(photos.first()).toContainText("frame-2.png");
    await expect(photos.first().locator("img")).toHaveCSS("transform", "matrix(0, 1, -1, 0, 0, 0)");
    await expect(photos).toHaveCount(3);
    await page.getByRole("button", { name: "Preview photo 1: frame-2.png", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "frame-2.png" })).toBeVisible();
    await page.getByRole("button", { name: "Close image preview", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const providers = (await (await page.request.get("/api/providers")).json()) as { configured: boolean }[];
    if (!providers.some((provider) => provider.configured)) {
      await expect(page.getByRole("button", { name: "Organize lecture", exact: true })).toBeEnabled();
      await expect(page.getByText("Reconstruction needs an AI connection.", { exact: false })).toBeVisible();
      await page.getByRole("button", { name: "Organize lecture", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Connect AI", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Close connect ai", exact: true }).click();
      await page.locator(".upload-simple-bottom > details > summary").click();
      await expect(page.getByRole("combobox", { name: "AI provider", exact: true })).toBeVisible();
      await expect(page.getByText("No provider configured", { exact: true })).toHaveCount(1);
    }

    await page.goto("/lessons");
    const row = page.locator(".simple-lesson-row").filter({ has: page.locator(`a[href='/lessons/${lessonId}']`) });
    await row.getByRole("button", { name: /^Options for / }).click();
    await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
    await page.getByRole("dialog", { name: "Rename lesson" }).getByLabel("Lesson name").fill(title);
    await page.getByRole("button", { name: "Save name", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(row).toContainText(title);
    await page.reload();
    await page.getByLabel("Search lessons", { exact: true }).fill(title);
    await expect(page.locator(".simple-lesson-row")).toHaveCount(1);
    await row.getByRole("button", { name: `Options for ${title}`, exact: true }).click();
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await page.getByRole("dialog", { name: "Delete this lesson?" }).getByRole("button", { name: "Delete lesson", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await page.request.get(`/api/lessons/${lessonId}`)).status()).toBe(404);
    lessonId = "";
  } finally {
    if (lessonId) await fetch(`http://127.0.0.1:3000/api/lessons/${lessonId}`, { method: "DELETE" });
  }
});
