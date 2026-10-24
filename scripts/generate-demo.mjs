import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const frames = [
  {
    label: "01 / Set up the problem",
    lines: [
      ["Completing the square", 100, 150, "#173d62", 48],
      ["Solve:  x² − 6x + 5 = 0", 110, 260, "#202f3d", 48],
      ["x² − 6x = −5", 120, 360, "#202f3d", 46],
      ["Add 9 to BOTH sides", 665, 410, "#a34b37", 29],
      ["x² − 6x + 9 = −5 + 9", 120, 480, "#202f3d", 46],
      ["Homework: p. [?]", 850, 670, "#82918a", 21],
    ],
  },
  {
    label: "02 / Complete the square",
    lines: [
      ["Completing the square", 100, 150, "#173d62", 48],
      ["x² − 6x + 9 = 4", 120, 270, "#202f3d", 48],
      ["(x − 3)² = 4", 120, 380, "#202f3d", 52],
      ["x − 3 = 2", 120, 500, "#a34b37", 48],
      ["Is there another root?", 650, 560, "#173d62", 30],
    ],
  },
  {
    label: "03 / Correct the missing root",
    lines: [
      ["Taking square roots", 100, 150, "#173d62", 48],
      ["(x − 3)² = 4", 120, 270, "#202f3d", 48],
      ["x − 3 = 2", 120, 380, "#a34b37", 43],
      ["Correction: take BOTH square roots", 560, 390, "#a34b37", 27],
      ["x − 3 = ±2", 120, 490, "#173d62", 52],
      ["x = 3 ± 2", 120, 600, "#202f3d", 48],
    ],
    strike: true,
  },
  {
    label: "04 / Verify and move on",
    lines: [
      ["Two roots. Check both.", 100, 150, "#173d62", 48],
      ["x = 1  or  x = 5", 120, 260, "#173d62", 52],
      ["1² − 6(1) + 5 = 0", 120, 370, "#202f3d", 42],
      ["5² − 6(5) + 5 = 0", 120, 460, "#202f3d", 42],
      ["Next problem: x² + 4x + 4 = 0", 120, 600, "#202f3d", 34],
      ["(not solved in captured frames)", 120, 650, "#63756e", 25],
    ],
  },
];
const escape = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
await mkdir(path.resolve("public/demo"), { recursive: true });
for (let index = 0; index < frames.length; index++) {
  const frame = frames[index];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800"><defs><linearGradient id="board" x2="0.6" y2="1"><stop stop-color="#f9faf5"/><stop offset="1" stop-color="#e6ece3"/></linearGradient><filter id="soft"><feGaussianBlur stdDeviation="0.22"/></filter></defs><rect width="1280" height="800" fill="#c4cbd1"/><rect x="22" y="22" width="1236" height="720" rx="4" fill="url(#board)" stroke="#77848b" stroke-width="8"/><path d="M60 201H1200 M65 702H1190" stroke="#d9e1d8" stroke-width="2"/><g font-family="Segoe Print, Comic Sans MS, cursive" font-style="italic" filter="url(#soft)">${frame.lines.map(([text, x, y, color, size]) => `<text x="${x}" y="${y}" fill="${color}" font-size="${size}">${escape(text)}</text>`).join("")}${frame.strike ? '<path d="M112 368L411 389M114 387L410 366" stroke="#a34b37" stroke-width="4"/>' : ""}</g><rect x="50" y="730" width="1180" height="14" rx="5" fill="#869398"/><rect x="800" y="718" width="83" height="12" rx="4" fill="#2670aa"/><rect x="895" y="718" width="83" height="12" rx="4" fill="#b25c47"/><text x="45" y="779" font-family="Arial,sans-serif" font-size="18" fill="#34424f">BoardReplay · SYNTHETIC SAMPLE · ${frame.label}</text></svg>`;
  await writeFile(
    path.resolve(`public/demo/frame-${index + 1}.png`),
    await sharp(Buffer.from(svg)).png().toBuffer(),
  );
}
console.log(
  "Created four original synthetic whiteboard frames in public/demo/.",
);
