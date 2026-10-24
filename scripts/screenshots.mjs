import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
await mkdir("screenshots", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
const failures = [];
page.on("pageerror", (e) => failures.push(e.message));
await page.goto("http://127.0.0.1:3000", { waitUntil: "networkidle" });
await page.screenshot({ path: "screenshots/01-home.png", fullPage: true });
const response = await page.request.post("http://127.0.0.1:3000/api/demo");
const { id } = await response.json();
if (!id) throw new Error("Sample setup failed.");
await page.goto(`http://127.0.0.1:3000/lessons/${id}`, {
  waitUntil: "networkidle",
});
await page.screenshot({ path: "screenshots/02-workspace.png", fullPage: true });
await page.goto(`http://127.0.0.1:3000/lab?lessonId=${id}`, {
  waitUntil: "networkidle",
});
await page.screenshot({
  path: "screenshots/03-comparison.png",
  fullPage: true,
});
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`http://127.0.0.1:3000/lessons/${id}`, {
  waitUntil: "networkidle",
});
await page.screenshot({ path: "screenshots/04-mobile.png", fullPage: true });
await browser.close();
console.log(JSON.stringify({ screenshots: 4, browserErrors: failures }));
