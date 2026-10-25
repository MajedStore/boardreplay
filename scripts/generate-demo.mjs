import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { linkedListFrames, disciplineFrames } from "../lib/demo-scenes.mjs";

const escape = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const W = 1280,
  H = 800;
function elementSvg(element) {
  const { layout: l, visual } = element;
  const x = l.x * W,
    y = l.y * H,
    w = l.width * W,
    h = l.height * H;
  if (visual?.shape === "arrow" || visual?.shape === "line") {
    return `<polyline points="${visual.points.map((p) => `${p.x * W},${p.y * H}`).join(" ")}" fill="none" stroke="${visual.shape === "line" ? "#b74739" : "#245675"}" stroke-width="4" ${visual.shape === "arrow" ? 'marker-end="url(#arrowhead)"' : ""}/>`;
  }
  if (visual?.shape === "rectangle")
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="#eef7fa" stroke="#245675" stroke-width="3"/><text x="${x + w / 2}" y="${y + h / 2 + 8}" text-anchor="middle" font-size="27" fill="#163e59">${escape(element.text)}</text>`;
  if (element.type === "table") {
    const rows = element.text
      .split("\n")
      .filter((row) => !row.includes("---"))
      .map((row) =>
        row
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim()),
      );
    const widths = [w * 0.27, w * 0.18, w * 0.55],
      rowHeight = h / rows.length;
    return rows
      .map((row, ri) =>
        row
          .map((cell, ci) => {
            const cx = x + widths.slice(0, ci).reduce((a, b) => a + b, 0);
            return `<rect x="${cx}" y="${y + ri * rowHeight}" width="${widths[ci]}" height="${rowHeight}" fill="${ri ? "#fbfcf8" : "#e5eef1"}" stroke="#8babb6"/><text x="${cx + 14}" y="${y + ri * rowHeight + rowHeight / 2 + 8}" font-size="25" fill="#203a4b">${escape(cell)}</text>`;
          })
          .join(""),
      )
      .join("");
  }
  const size =
    element.type === "heading" ? 38 : element.type === "code" ? 21 : 25;
  const lines = element.text.split("\n");
  return `${element.type === "code" ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#edf1ec" stroke="#bac8c1"/>` : ""}<g font-family="${element.type === "code" ? "Consolas,monospace" : "Segoe UI,Arial,sans-serif"}" fill="${element.type === "annotation" ? "#66514c" : "#203a4b"}" font-size="${size}">${lines.map((line, i) => `<text xml:space="preserve" x="${x + (element.type === "code" ? 12 : 0)}" y="${y + size + i * (size * 1.45)}">${escape(line)}</text>`).join("")}</g>`;
}
function boardSvg(frame) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><marker id="arrowhead" markerWidth="9" markerHeight="8" refX="8" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="none" stroke="#245675" stroke-width="1.5"/></marker></defs><rect width="${W}" height="${H}" fill="#f8faf4"/><rect x="5" y="5" width="1270" height="790" rx="8" fill="none" stroke="#829aa0" stroke-width="10"/><g font-family="Segoe UI,Arial,sans-serif">${frame.elements
    .filter((e) => !["arrow", "shape", "image_crop"].includes(e.type))
    .map(elementSvg)
    .join("")}${frame.elements
    .filter((e) => ["arrow", "shape"].includes(e.type))
    .map(elementSvg)
    .join(
      "",
    )}${frame.sourceSvg || ""}</g><text x="24" y="777" font-family="Arial,sans-serif" font-size="15" fill="#637b7b">BoardReplay · ORIGINAL SYNTHETIC SAMPLE · ${escape(frame.title)}</text></svg>`;
}
for (const [key, frames] of Object.entries(disciplineFrames)) {
  for (let index = 0; index < frames.length; index++) {
    await writeFile(
      path.resolve(`public/demo/${key}-${index + 1}.png`),
      await sharp(Buffer.from(boardSvg(frames[index])))
        .png()
        .toBuffer(),
    );
  }
}
await mkdir(path.resolve("public/demo"), { recursive: true });
for (let index = 0; index < linkedListFrames.length; index++) {
  await writeFile(
    path.resolve(`public/demo/frame-${index + 1}.png`),
    await sharp(Buffer.from(boardSvg(linkedListFrames[index])))
      .png()
      .toBuffer(),
  );
}
console.log(
  "Created five original synthetic engineering lecture frames from the same normalized scene definitions as the replay.",
);
