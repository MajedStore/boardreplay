import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import sharp from "sharp";
import type { Lesson, LectureDocument } from "../../lib/types";
import { documentFixture } from "./fixtures/photo-document";

async function openLessonOption(page: Page, label: string) {
  await page.getByRole("button", { name: "Lesson options", exact: true }).click();
  await page.getByRole("button", { name: label, exact: true }).click();
}

test("nine shuffled uploads become a photo-first contextual lecture with every repeated source retained", async ({ page }) => {
  let lessonId = "";
  let phase = "READY";
  let document: LectureDocument | null = null;
  const submitted: unknown[] = [];
  const frameOrder = [3, 1, 4, 2, 5, 3, 2, 1, 4];
  try {
    let connected = false;
    await page.route("**/api/providers", (route) => route.fulfill({ json: [{ id: "openai", name: "OpenAI", model: "mock-document-model", configured: connected }] }));
    await page.route("**/api/providers/configure", (route) => { connected = true; return route.fulfill({ json: [{ id: "openai", name: "OpenAI", model: "mock-document-model", configured: true }] }); });
    await page.goto("/");
    const created = page.waitForResponse((response) => response.url().endsWith("/api/lessons") && response.request().method() === "POST");
    await page.getByLabel("Upload photos", { exact: true }).setInputFiles(frameOrder.map((frame) => path.resolve(`public/demo/frame-${frame}.png`)));
    lessonId = (await (await created).json()).id;
    await expect(page).toHaveURL(new RegExp(`/lessons/${lessonId}$`), { timeout: 20000 });
    await expect(page.getByRole("list", { name: "Photo sequence" }).locator("li")).toHaveCount(9);
    await page.getByRole("button", { name: "Organize lecture", exact: true }).click();
    const connection = page.getByRole("dialog", { name: "Connect AI", exact: true });
    await expect(connection).toBeVisible();
    await connection.getByLabel("API key", { exact: true }).fill("mock-document-browser-only-key");
    await connection.getByRole("button", { name: "Save connection", exact: true }).click();
    await expect(connection).toHaveCount(0);

    const saved = (await (await page.request.get(`/api/lessons/${lessonId}`)).json()) as Lesson;
    const order = frameOrder.map((frame, index) => ({ frame, imageId: saved.images[index].id })).sort((a, b) => a.frame - b.frame).map((item) => item.imageId);
    document = documentFixture(saved.images, order);
    const stateGroups = [1, 2, 3, 4, 5].map((frame) => {
      const imageIds = frameOrder.flatMap((value, index) => value === frame ? [saved.images[index].id] : []);
      return { id: `group-${frame}`, imageIds, primaryImageId: imageIds[0], reason: "Repeated authored image files in a deterministic UI fixture.", confidence: "MEDIUM" as const };
    });
    document.organization.sequences[0].states = stateGroups;
    document.organization.duplicateGroups = stateGroups.filter((state) => state.imageIds.length > 1).map((state) => ({ imageIds: state.imageIds, primaryImageId: state.primaryImageId, kind: "EXACT", reason: "Exact repeated synthetic input file." }));
    for (let index = 1; index < document.photos.length; index++) {
      const currentFrame = frameOrder[saved.images.findIndex((image) => image.id === document!.photos[index].imageId)];
      const previousFrame = frameOrder[saved.images.findIndex((image) => image.id === document!.photos[index - 1].imageId)];
      if (currentFrame === previousFrame) {
        document.photos[index].relation = "REPEAT";
        document.photos[index].heading = "Tekrarlanan görünüm";
        document.photos[index].bodyMarkdown = "Bu fotoğraf önceki tahta içeriğini tekrar gösteriyor; yeni bir bilgi eklenmiyor.";
      }
    }
    document.organization.warnings = ["Authored UI fixture: automatic results are mocked, not a vision accuracy result."];
    await page.route(`**/api/lessons/${lessonId}`, async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      const response = await route.fetch();
      return route.fulfill({ json: { ...(await response.json()), status: phase, document: phase === "COMPLETED" ? document : null, reconstruction: null, photoOrganization: ["ORGANIZING", "RECONSTRUCTING", "COMPLETED"].includes(phase) ? document!.organization : null } });
    });
    await page.route(`**/api/lessons/${lessonId}/process`, (route) => { submitted.push(route.request().postDataJSON()); phase = "ANALYZING"; return route.fulfill({ status: 202, json: { runId: "mock-nine-photo-document", status: phase } }); });
    await page.getByRole("button", { name: "Organize lecture", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Analyzing photos/ })).toBeVisible();
    expect(submitted).toEqual([{ provider: "openai", orderMode: "AUTO" }]);
    phase = "ORGANIZING";
    await expect(page.getByRole("heading", { name: /Organizing your lecture/ })).toBeVisible();
    phase = "RECONSTRUCTING";
    await expect(page.getByRole("heading", { name: /Writing explanations/ })).toBeVisible();
    phase = "COMPLETED";
    const lecture = page.getByTestId("lecture-document");
    await expect(lecture).toBeVisible();
    const photos = lecture.getByTestId("lecture-photo");
    await expect(photos).toHaveCount(9);
    expect(await photos.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-image-id")))).toEqual(order);
    await expect(lecture.locator(".lecture-explanation")).toHaveCount(9);
    await expect(lecture.getByText("Bu fotoğraf önceki tahta içeriğini tekrar gösteriyor; yeni bir bilgi eklenmiyor.", { exact: true })).toHaveCount(4);
    await expect(lecture).toContainText("Tam diferansiyel denklemler");
    expect(await photos.evaluateAll((articles) => articles.every((article) => {
      const image = article.querySelector("img"), explanation = article.querySelector(".lecture-explanation");
      return !!image && !!explanation && !!(image.compareDocumentPosition(explanation) & Node.DOCUMENT_POSITION_FOLLOWING);
    }))).toBe(true);
    await expect(page.getByTestId("spatial-board")).toHaveCount(0);
    await expect(page.locator("foreignObject, .lesson-player, .workspace-sidebar")).toHaveCount(0);
    expect(await page.evaluate(() => Object.values(localStorage).join(" "))).not.toContain("mock-document-browser-only-key");
  } finally {
    if (lessonId) await fetch(`http://127.0.0.1:3000/api/lessons/${lessonId}`, { method: "DELETE" });
  }
});

test("edit a photo explanation, preserve its draft on failure, save a revision, and reorder with corrected context", async ({ page }) => {
  const demo = (await (await page.request.post("/api/demo?fresh=true")).json()) as { id: string };
  try {
    const before = (await (await page.request.get(`/api/lessons/${demo.id}`)).json()) as Lesson;
    const imageIds = before.document!.photos.map((photo) => photo.imageId);
    await page.goto(`/lessons/${demo.id}`);
    await expect(page.getByTestId("lecture-photo")).toHaveCount(5);
    await page.getByRole("button", { name: "Edit explanation for photo 1", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Edit explanation", exact: true });
    const revised = "İşaretçi değiştirilmeden önce ardıl düğüm korunmalıdır. Bu açıklama kullanıcı tarafından düzeltildi.";
    await editor.getByLabel("Heading", { exact: true }).fill("Kullanıcı düzeltmesi");
    await editor.getByLabel("Explanation", { exact: true }).fill(revised);
    await page.route(`**/api/lessons/${demo.id}`, (route) => route.request().method() === "PATCH" ? route.fulfill({ status: 400, json: { error: "Test save failed. Retry your explanation." } }) : route.continue());
    await editor.getByRole("button", { name: "Save explanation", exact: true }).click();
    await expect(editor.getByRole("alert")).toContainText("Test save failed");
    await expect(editor.getByLabel("Explanation", { exact: true })).toHaveValue(revised);
    await page.unroute(`**/api/lessons/${demo.id}`);
    await editor.getByRole("button", { name: "Save explanation", exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(page.getByTestId("lecture-photo").first()).toContainText(revised);
    await page.reload();
    await expect(page.getByTestId("lecture-photo").first()).toContainText(revised);
    let saved = (await (await page.request.get(`/api/lessons/${demo.id}`)).json()) as Lesson;
    expect(saved.document!.photos[0]).toMatchObject({ imageId: imageIds[0], heading: "Kullanıcı düzeltmesi", bodyMarkdown: revised, evidenceStatus: "USER_EDITED" });
    expect(saved.revisions.length).toBeGreaterThan(before.revisions.length);
    await page.getByRole("button", { name: "Move photo 2 earlier", exact: true }).click();
    await expect(page.getByTestId("lecture-photo").first()).toHaveAttribute("data-image-id", imageIds[1]);
    saved = (await (await page.request.get(`/api/lessons/${demo.id}`)).json()) as Lesson;
    expect(saved.document!.photos.map((photo) => photo.imageId)).toEqual([imageIds[1], imageIds[0], ...imageIds.slice(2)]);
    expect(saved.explanationsNeedRefresh).toBe(true);
    await expect(page.getByText(/regenerat.*explanation|explanation.*context/i).first()).toBeVisible();
    let processing: { provider?: string; orderMode?: string } | null = null;
    await page.route("**/api/providers", (route) => route.fulfill({ json: [{ id: "openai", name: "OpenAI", model: "mock", configured: true }] }));
    await page.route(`**/api/lessons/${demo.id}/process`, (route) => { processing = route.request().postDataJSON(); return route.fulfill({ status: 202, json: { runId: "mock-corrected-context", status: "ANALYZING" } }); });
    await page.reload();
    const regenerate = page.getByRole("button", { name: "Regenerate explanations", exact: true });
    if (!(await regenerate.count())) await openLessonOption(page, "Manage photos");
    await page.getByRole("button", { name: "Regenerate explanations", exact: true }).first().click();
    await expect.poll(() => processing?.orderMode).toBe("MANUAL");
    expect((await (await page.request.get(`/api/lessons/${demo.id}`)).json()).images).toHaveLength(5);
  } finally {
    await fetch(`http://127.0.0.1:3000/api/lessons/${demo.id}`, { method: "DELETE" });
  }
});

test("long Turkish academic explanations and mixed image proportions stay in normal flow on desktop and mobile", async ({ page }) => {
  let lessonId = "";
  try {
    const created = await page.request.post("/api/lessons", { data: { title: "AUTOMATED TEST — mixed photographic lecture", language: "Türkçe" } });
    lessonId = (await created.json()).id;
    for (const [width, height] of [[960, 540], [540, 960]]) {
      const buffer = await sharp({ create: { width, height, channels: 3, background: "#e9f2f4" } }).png().toBuffer();
      expect((await page.request.post(`/api/lessons/${lessonId}/images`, { multipart: { files: { name: `${width}x${height}.png`, mimeType: "image/png", buffer } } })).ok()).toBe(true);
    }
    const saved = (await (await page.request.get(`/api/lessons/${lessonId}`)).json()) as Lesson;
    const lectureDocument = documentFixture(saved.images);
    lectureDocument.photos[0].bodyMarkdown += "\n\n$$\n\\begin{aligned}\n\\frac{\\partial}{\\partial y}\\left(x^2y+\\sin(xy)\\right)&=x^2+x\\cos(xy)\\\\\n\\int\\left(x^2+x\\cos(xy)\\right)\\,dy&=x^2y+\\sin(xy)+C(x)\n\\end{aligned}\n$$\n\nGörünen türev ve integral adımları, önceki fotoğraftaki denklemin devamını açıklar. Üniversite düzeyindeki teknik terimler ve özgün dil korunur.";
    lectureDocument.photos[1].bodyMarkdown = "Bu teknik örnek düğüm bağlantısını gösterir.\n\n```cpp\nNode* n = new Node{20, nullptr};\nn->next = head->next;\nhead->next = n;\n```\n\nKod çalıştırılmaz; fotoğrafta görülen algoritmanın bağlantı düzeni açıklanır.";
    await page.route(`**/api/lessons/${lessonId}`, (route) => route.fulfill({ json: { ...saved, status: "COMPLETED", document: lectureDocument, reconstruction: null, photoOrganization: lectureDocument.organization } }));
    await page.goto(`/lessons/${lessonId}`);
    await expect(page.getByTestId("lecture-photo")).toHaveCount(2);
    await page.evaluate(async () => { for (const image of document.images) image.loading = "eager"; await Promise.all([...document.images].map((image) => image.decode().catch(() => {}))); });
    await expect(page.locator(".lecture-explanation .katex").first()).toBeVisible();
    await expect(page.locator(".lecture-explanation .token-keyword").first()).toBeVisible();
    await expect(page.locator(".katex-error")).toHaveCount(0);
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const fit = await page.getByTestId("lecture-photo").evaluateAll((articles) => articles.map((article) => {
        const image = article.querySelector("img")!, explanation = article.querySelector(".lecture-explanation")!;
        const imageBounds = image.getBoundingClientRect(), explanationBounds = explanation.getBoundingClientRect();
        const scrollable = [...explanation.querySelectorAll("*")].filter((element) => {
          const style = getComputedStyle(element);
          return (style.overflowX === "auto" || style.overflowX === "scroll" || style.overflowY === "auto" || style.overflowY === "scroll") && (element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2);
        });
        return { ratio: imageBounds.width / imageBounds.height, naturalRatio: image.naturalWidth / image.naturalHeight, below: explanationBounds.y >= imageBounds.bottom - 1, clipped: explanation.scrollWidth > explanation.clientWidth + 2, scrollbars: scrollable.length, position: getComputedStyle(explanation).position };
      }));
      for (const result of fit) {
        expect(result.ratio).toBeCloseTo(result.naturalRatio, 2);
        expect(result.below).toBe(true);
        expect(result.clipped).toBe(false);
        expect(result.scrollbars).toBe(0);
        expect(result.position).not.toBe("absolute");
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
    await page.getByRole("button", { name: "Open photo 2", exact: true }).click();
    const viewer = page.getByRole("dialog", { name: "Original photograph", exact: true });
    await expect(viewer).toBeVisible();
    await expect(viewer.getByRole("link", { name: "Open high-resolution original", exact: true })).toHaveAttribute("href", saved.images[1].url);
    await viewer.getByRole("button", { name: "Zoom in photograph", exact: true }).click();
    await expect(viewer.getByRole("button", { name: "Reset photograph zoom", exact: true })).toContainText("125%");
    await expect(viewer.getByRole("button", { name: "Fullscreen photograph", exact: true })).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(viewer).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open photo 2", exact: true })).toBeFocused();
  } finally {
    if (lessonId) await fetch(`http://127.0.0.1:3000/api/lessons/${lessonId}`, { method: "DELETE" });
  }
});

test("PDF export contains every original followed by its explanation and no reconstruction canvas", async ({ page, context }, testInfo) => {
  const demo = (await (await page.request.post("/api/demo?fresh=true")).json()) as { id: string };
  try {
    const saved = (await (await page.request.get(`/api/lessons/${demo.id}`)).json()) as Lesson;
    await page.goto(`/lessons/${demo.id}`);
    const popup = context.waitForEvent("page");
    await page.getByRole("link", { name: "Export PDF", exact: true }).click();
    const printPage = await popup;
    await expect(printPage.getByTestId("lecture-document")).toBeVisible();
    await expect(printPage.getByTestId("lecture-photo")).toHaveCount(saved.images.length);
    await expect(printPage.getByTestId("spatial-board")).toHaveCount(0);
    await expect(printPage.locator(".lecture-explanation")).toHaveCount(saved.images.length);
    expect(await printPage.getByTestId("lecture-photo").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-image-id")))).toEqual(saved.document!.photos.map((photo) => photo.imageId));
    await printPage.evaluate(async () => { await document.fonts.ready; for (const image of document.images) image.loading = "eager"; await Promise.all([...document.images].map((image) => image.decode().catch(() => {}))); });
    await printPage.emulateMedia({ media: "print" });
    await expect(printPage.locator(".katex-error")).toHaveCount(0);
    const pdf = await printPage.pdf({ path: testInfo.outputPath("organized-photo-lecture.pdf"), printBackground: true, preferCSSPageSize: true });
    expect(pdf.length).toBeGreaterThan(20000);
    expect((pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length).toBeGreaterThan(1);
    expect(await printPage.getByTestId("lecture-photo").evaluateAll((articles) => articles.every((article) => getComputedStyle(article.querySelector(".lecture-explanation")!).position !== "absolute"))).toBe(true);
    await printPage.close();
  } finally {
    await fetch(`http://127.0.0.1:3000/api/lessons/${demo.id}`, { method: "DELETE" });
  }
});

for (const configured of [true, false]) {
  test(`a genuine explanation failure preserves the document and ${configured ? "retries with the selected provider" : "opens Connect AI when a connection is missing"}`, async ({ page }) => {
    const demo = (await (await page.request.post("/api/demo?fresh=true")).json()) as { id: string };
    try {
      const actual = (await (await page.request.get(`/api/lessons/${demo.id}`)).json()) as Lesson;
      let phase = "FAILED";
      const requests: { provider: string; orderMode: string }[] = [];
      await page.route("**/api/providers", (route) => route.fulfill({ json: [{ id: "openai", name: "OpenAI", model: "mock-failure-recovery", configured }] }));
      await page.route(`**/api/lessons/${demo.id}`, (route) => route.fulfill({ json: { ...actual, isDemo: false, status: phase, error: phase === "FAILED" ? "The AI service could not finish. Your photos and previous explanations are saved." : null } }));
      await page.route(`**/api/lessons/${demo.id}/process`, (route) => { requests.push(route.request().postDataJSON()); phase = "ANALYZING"; return route.fulfill({ status: 202, json: { runId: "mock-document-retry", status: phase } }); });
      await page.goto(`/lessons/${demo.id}`);
      await expect(page.getByTestId("lecture-photo")).toHaveCount(5);
      await page.getByRole("button", { name: "Retry reconstruction", exact: true }).click();
      if (configured) {
        await expect(page.getByRole("heading", { name: /Analyzing photos/ })).toBeVisible();
        expect(requests).toEqual([{ provider: "openai", orderMode: "AUTO" }]);
      } else {
        await expect(page.getByRole("dialog", { name: "Connect AI", exact: true })).toBeVisible();
        expect(requests).toEqual([]);
      }
    } finally {
      await fetch(`http://127.0.0.1:3000/api/lessons/${demo.id}`, { method: "DELETE" });
    }
  });
}
