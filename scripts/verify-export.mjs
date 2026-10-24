import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
await mkdir("screenshots", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1100 } });
const sample = await (
  await page.request.post("http://127.0.0.1:3000/api/demo")
).json();
await page.goto(`http://127.0.0.1:3000/lessons/${sample.id}/print`, {
  waitUntil: "networkidle",
});
await page.locator(".print-document .katex").first().waitFor();
await page.evaluate(async () => {
  await document.fonts.ready;
});
await page.emulateMedia({ media: "print" });
await page.screenshot({
  path: "screenshots/05-notes-print.png",
  fullPage: true,
});
const pdf = await page.pdf({
  path: "screenshots/sample-lesson.pdf",
  preferCSSPageSize: true,
  printBackground: true,
});
const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
if (pages < 1 || pdf.length < 10000)
  throw new Error("PDF output is unexpectedly empty.");
const latexErrors = await page.locator(".katex-error").count();
if (latexErrors) throw new Error("A sample equation failed to render.");
console.log(
  JSON.stringify({ pdfPages: pages, bytes: pdf.length, latexErrors }),
);
await browser.close();
