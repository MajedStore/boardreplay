import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

await mkdir("screenshots", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1100 } });
let sampleId = "";
try {
  const sample = await (await page.request.post("http://127.0.0.1:3000/api/demo?fresh=true")).json();
  sampleId = sample.id;
  const lesson = await (await page.request.get(`http://127.0.0.1:3000/api/lessons/${sampleId}`)).json();
  await page.goto(`http://127.0.0.1:3000/lessons/${sampleId}/print`, { waitUntil: "networkidle" });
  await page.getByTestId("lecture-document").waitFor();
  await page.evaluate(async () => { await document.fonts.ready; for (const image of document.images) image.loading = "eager"; await Promise.all([...document.images].map((image) => image.decode().catch(() => {}))); });
  if (await page.getByTestId("spatial-board").count()) throw new Error("Export contains the obsolete spatial canvas.");
  const orderedSources = await page.getByTestId("lecture-photo").evaluateAll((articles) => articles.map((article) => article.getAttribute("data-image-id")));
  if (JSON.stringify(orderedSources) !== JSON.stringify(lesson.document.photos.map((photo) => photo.imageId))) throw new Error("Export photo order differs from the saved document.");
  const explanations = await page.locator(".lecture-explanation").count();
  if (explanations !== lesson.images.length) throw new Error("Every original photo must retain its own explanation.");
  await page.emulateMedia({ media: "print" });
  await page.screenshot({ path: "screenshots/05-notes-print.png", fullPage: true });
  const pdf = await page.pdf({ path: "screenshots/sample-lesson.pdf", preferCSSPageSize: true, printBackground: true });
  const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
  if (pages < 1 || pdf.length < 10000) throw new Error("PDF output is unexpectedly empty.");
  const latexErrors = await page.locator(".katex-error").count();
  if (latexErrors) throw new Error("A sample equation failed to render.");
  console.log(JSON.stringify({ pdfPages: pages, bytes: pdf.length, photos: orderedSources.length, explanations, latexErrors, spatialCanvases: 0 }));
} finally {
  if (sampleId) await page.request.delete(`http://127.0.0.1:3000/api/lessons/${sampleId}`);
  await browser.close();
}
