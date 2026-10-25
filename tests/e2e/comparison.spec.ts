import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

test("three manual tools, honest human ranking, exports and four-page academic report", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120000);
  page.setDefaultTimeout(30000);
  const lessonResponse = await request.post("/api/lessons", {
    data: {
      title: "AUTOMATED TEST — comparison fixture",
      course: "Automated testing only",
    },
  });
  expect(lessonResponse.ok()).toBeTruthy();
  const lesson = await lessonResponse.json();
  const lessonId = lesson.id as string;
  try {
    const imageResponse = await request.post(
      `/api/lessons/${lessonId}/images`,
      {
        multipart: {
          files: {
            name: "synthetic-test-whiteboard.png",
            mimeType: "image/png",
            buffer: fs.readFileSync(path.resolve("public/demo/frame-1.png")),
          },
        },
      },
    );
    expect(imageResponse.ok()).toBeTruthy();
    const uploaded = await imageResponse.json();
    const imageId = uploaded.images[0].id as string;
    await page.goto("/");
    await page.getByRole("button", { name: "More options", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "All lessons", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "AI Comparison Lab", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/lab$/);
    await page.goto(`/lab?lessonId=${lessonId}`);
    await expect(
      page.getByRole("heading", { name: "AI Comparison Lab." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Save new benchmark" }).click();
    await expect(page.locator(".provider-connect-card")).toHaveCount(3);
    await expect(page.locator(".ranking-empty")).toContainText(
      "No ranking yet",
    );
    await page.locator(".lab-benchmark-receipt summary").click();
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByRole("button", { name: "Copy prompt" }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain(
      "Never invent unseen writing, missing code, diagram topology",
    );
    expect(copied).toContain(`Source image 1; image ID: ${imageId}`);
    const preparedDownloadEvent = page.waitForEvent("download");
    await page
      .getByRole("link", { name: "Download photo 1", exact: true })
      .click();
    const preparedDownload = await preparedDownloadEvent;
    expect(preparedDownload.suggestedFilename()).toBe(
      "boardreplay-photo-01.jpg",
    );
    await preparedDownload.saveAs(testInfo.outputPath("prepared-photo.jpg"));
    expect(
      fs
        .readFileSync(testInfo.outputPath("prepared-photo.jpg"))
        .subarray(0, 2)
        .toString("hex"),
    ).toBe("ffd8");
    await page.locator(".lab-benchmark-receipt summary").click();

    for (let provider = 0; provider < 3; provider++) {
      await page
        .locator(".provider-connect-card")
        .nth(provider)
        .getByRole("button", { name: "Paste manual response" })
        .click();
      await page
        .getByLabel("Model identifier, if known")
        .fill(`AUTOMATED TEST MODEL ${provider + 1}`);
      await page
        .getByLabel("Actual raw response")
        .fill(
          `AUTOMATED TEST RESPONSE — not an actual provider experiment. Fixture ${provider + 1}: head points to node 10, then node 30. A Node structure contains a value and a next pointer. Uncaptured connections cannot be recovered.`,
        );
      await page
        .getByLabel("Notes (optional)")
        .fill(
          "AUTOMATED TEST FIXTURE ONLY. This record is deleted when the test finishes.",
        );
      await page
        .getByRole("checkbox", { name: /I used this saved prompt/ })
        .check();
      await page.getByRole("button", { name: "Save manual response" }).click();
      await expect(page.locator(".result-card")).toHaveCount(provider + 1);
      const result = page.locator(".result-card").nth(provider);
      await expect(result).toContainText("Manual submission");
      const inputs = result.locator(".score-select");
      await expect(inputs).toHaveCount(8);
      expect(await inputs.first().locator('option[value="6"]').count()).toBe(0);
      expect(await inputs.first().locator('option[value="-1"]').count()).toBe(
        0,
      );
      const score = [4, 3, 5][provider];
      for (let category = 0; category < 8; category++)
        await inputs.nth(category).selectOption(String(score));
      await result.getByRole("button", { name: "Save assessment" }).click();
      await expect(result).toContainText(`Saved score: ${score * 8}/40`);
      if (provider === 0)
        await expect(page.locator(".ranking-empty")).toBeVisible();
    }
    await expect(page.locator(".ranking-row")).toHaveCount(3);
    await expect(page.locator(".ranking-row").first()).toContainText(
      "Claude / Anthropic",
    );
    await expect(page.locator(".ranking-row").first()).toContainText("40");
    const reference =
      "AUTOMATED TEST REFERENCE: head -> 10 -> 30 -> nullptr. Synthetic image fixture; not a real experiment.";
    await page
      .getByLabel("Verified reference reconstruction / answer key")
      .fill(reference);
    await page.getByRole("button", { name: "Save reference" }).click();
    await expect(page.getByRole("status")).toContainText("Reference saved");
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("button", { name: "CSV", exact: true }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toMatch(
      /boardreplay-comparison-.*\.csv$/,
    );
    await download.saveAs(testInfo.outputPath("test-comparison.csv"));
    const exported = fs.readFileSync(
      testInfo.outputPath("test-comparison.csv"),
      "utf8",
    );
    expect(exported).toContain("AUTOMATED TEST RESPONSE");
    expect(exported).toContain("MANUAL");
    expect(exported).toContain(reference);

    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: testInfo.outputPath("lab-mobile.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: testInfo.outputPath("lab-desktop.png"),
      fullPage: true,
    });
    await page.getByRole("link", { name: /Prepare report/ }).click();
    await expect(
      page.getByRole("heading", { name: "A report with receipts." }),
    ).toBeVisible();
    const conclusion =
      "AUTOMATED TEST NARRATIVE: These fixture scores validate software behavior only. They are not research findings.";
    await page.getByLabel("Conclusion", { exact: true }).fill(conclusion);
    await page.getByRole("button", { name: "Save narrative" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Report narrative saved",
    );
    await page.reload();
    await expect(page.getByLabel("Conclusion", { exact: true })).toHaveValue(
      conclusion,
    );
    await expect(page.locator(".report-document")).toContainText(
      "AUTOMATED TEST MODEL 1",
    );
    await expect(page.locator(".report-sheet")).toHaveCount(4);
    await expect(page.locator(".report-document img").first()).toHaveAttribute(
      "src",
      new RegExp(`/api/comparisons/[^/]+/images/${imageId}$`),
    );
    await page.getByRole("button", { name: "More options", exact: true }).click();
    await page.getByRole("menuitem", { name: "Use dark theme", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.emulateMedia({ media: "print" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [
          ...document.querySelectorAll<HTMLImageElement>(
            ".report-document img",
          ),
        ].map((image) => image.decode().catch(() => undefined)),
      );
    });
    expect(
      await page
        .locator(".report-sheet")
        .first()
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    ).toBe("rgb(255, 255, 255)");
    expect(
      await page
        .locator(".report-score-table th")
        .first()
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    ).not.toBe("rgb(22, 34, 52)");
    const pdf = await page.pdf({
      path: testInfo.outputPath("academic-report.pdf"),
      printBackground: true,
      preferCSSPageSize: true,
    });
    expect(
      (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length,
    ).toBe(4);
    await page
      .locator(".report-sheet")
      .first()
      .screenshot({ path: testInfo.outputPath("report-print-first-page.png") });
  } finally {
    const baseUrl = testInfo.project.use.baseURL ?? "http://127.0.0.1:3000";
    const deleted = await fetch(`${baseUrl}/api/lessons/${lessonId}`, {
      method: "DELETE",
    });
    expect(deleted.ok).toBeTruthy();
    expect((await fetch(`${baseUrl}/api/lessons/${lessonId}`)).status).toBe(
      404,
    );
  }
});
