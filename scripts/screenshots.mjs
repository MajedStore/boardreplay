import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

await mkdir("screenshots", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const failures = [];
page.on("pageerror", (error) => failures.push({ url: page.url(), error: error.message }));
// Tracked UI captures must never include a private lesson thumbnail or title.
await page.route("**/api/lessons", async (route) => {
  if (route.request().method() !== "GET") return route.continue();
  const response = await route.fetch();
  const lessons = await response.json();
  return route.fulfill({ json: lessons.filter((lesson) => lesson.isDemo) });
});
let sampleId = "", uploadId = "";
try {
  await page.goto("http://127.0.0.1:3000", { waitUntil: "networkidle" });
  await page.screenshot({ path: "screenshots/01-home.png", fullPage: true });
  const sample = await (await page.request.post("http://127.0.0.1:3000/api/demo?fresh=true")).json();
  sampleId = sample.id;
  if (!sampleId) throw new Error("Synthetic sample setup failed.");
  await page.goto(`http://127.0.0.1:3000/lessons/${sampleId}`, { waitUntil: "networkidle" });
  await page.getByTestId("lecture-document").waitFor();
  await page.evaluate(async () => { await document.fonts.ready; for (const image of document.images) image.loading = "eager"; await Promise.all([...document.images].map((image) => image.decode().catch(() => {}))); });
  if (await page.getByTestId("spatial-board").count()) throw new Error("The obsolete spatial canvas is still present.");
  await page.screenshot({ path: "screenshots/02-workspace.png", fullPage: true });
  await page.getByTestId("lecture-photo").last().screenshot({ path: "screenshots/06-new-topic.png" });
  await page.goto("http://127.0.0.1:3000/lessons/new");
  await page.locator(".upload-simple-details > summary").click();
  await page.getByLabel("Lesson name", { exact: true }).fill("Synthetic nine-photo upload");
  const creation = page.waitForResponse((response) => response.url().endsWith("/api/lessons") && response.request().method() === "POST");
  await page.getByLabel("Upload photos", { exact: true }).setInputFiles([3, 1, 5, 2, 4, 2, 1, 4, 3].map((index) => `public/demo/frame-${index}.png`));
  uploadId = (await (await creation).json()).id;
  await page.waitForURL(`http://127.0.0.1:3000/lessons/${uploadId}`);
  await page.locator(".upload-simple-photo").nth(8).waitFor();
  await page.locator(".upload-simple-photo img").evaluateAll(async (images) => { await Promise.all(images.map((image) => image.decode().catch(() => {}))); });
  await page.screenshot({ path: "screenshots/07-arrange-photos.png", fullPage: true });
  const providers = await (await page.request.get("http://127.0.0.1:3000/api/providers")).json();
  const aiTitle = providers.some((provider) => provider.configured) ? "Change AI" : "Connect AI";
  // Opening settings never saves credentials or starts a provider request.
  await page.getByRole("button", { name: aiTitle, exact: true }).click();
  await page.getByRole("dialog", { name: aiTitle, exact: true }).waitFor();
  await page.screenshot({ path: "screenshots/09-ai-connection.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "screenshots/10-ai-mobile.png", fullPage: true });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`http://127.0.0.1:3000/lab?lessonId=${sampleId}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: "screenshots/03-comparison.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`http://127.0.0.1:3000/lessons/${sampleId}`, { waitUntil: "networkidle" });
  await page.getByTestId("lecture-document").waitFor();
  await page.evaluate(async () => { await document.fonts.ready; for (const image of document.images) image.loading = "eager"; await Promise.all([...document.images].map((image) => image.decode().catch(() => {}))); });
  await page.screenshot({ path: "screenshots/04-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Open photo 1", exact: true }).click();
  await page.getByRole("dialog", { name: "Original photograph", exact: true }).waitFor();
  await page.getByRole("dialog").locator("img").evaluateAll(async (images) => { await Promise.all(images.map((image) => image.decode().catch(() => {}))); });
  await page.screenshot({ path: "screenshots/08-original-mobile.png", fullPage: false });
  if (failures.length) throw new Error(`Browser page errors: ${JSON.stringify(failures)}`);
  console.log(JSON.stringify({ browserErrors: failures, directory: "screenshots", content: "Synthetic photo-first lecture documents only" }));
} finally {
  if (uploadId) await page.request.delete(`http://127.0.0.1:3000/api/lessons/${uploadId}`);
  if (sampleId) await page.request.delete(`http://127.0.0.1:3000/api/lessons/${sampleId}`);
  await browser.close();
}
