import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  analyzePhotoMetrics,
  compareAllPhotoMetrics,
  comparePhotoMetrics,
  findPhotoSimilarityCandidates,
  readExifCaptureTime,
} from "../lib/photos/metrics";

async function board(addition = "") {
  return sharp(Buffer.from(`<svg width="512" height="320" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="320" fill="white"/><g fill="none" stroke="#132d37" stroke-width="2"><rect x="50" y="65" width="95" height="42"/><rect x="270" y="65" width="95" height="42"/><path d="M145 86 H270 M258 79 L270 86 L258 93"/></g><g fill="#142830" font-size="18" font-family="Arial"><text x="59" y="94">10 | next</text><text x="280" y="94">30 | next</text><text x="50" y="170">struct Node {</text><text x="65" y="197">int value;</text><text x="65" y="224">Node* next;</text><text x="50" y="251">};</text><text x="380" y="285" font-size="13">${addition}</text></g></svg>`)).png().toBuffer();
}

describe("actual prepared-photo metrics", () => {
  it("recognizes identical decoded views across encodings without conflating raw bytes", async () => {
    const photo = await board();
    const alternate = await sharp(photo).png({ compressionLevel: 0 }).toBuffer();
    const first = await analyzePhotoMetrics({ imageId: "a", prepared: photo, original: photo });
    const second = await analyzePhotoMetrics({ imageId: "b", prepared: alternate, original: alternate });
    expect(first.preparedSha256).not.toBe(second.preparedSha256);
    expect(comparePhotoMetrics(first, second)).toMatchObject({ exactPixels: true, sameOriginalFile: false, possibleDuplicate: true, similarity: 1 });
    expect(first).toMatchObject({ width: 512, height: 320, capturedAt: null, timestampBasis: "UNAVAILABLE" });
    expect(first.perceptualHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });
  it("retains a nearly identical view with a small additional equation as a semantic candidate, never an exact duplicate", async () => {
    const first = await analyzePhotoMetrics({ imageId: "before", prepared: await board() });
    const second = await analyzePhotoMetrics({ imageId: "after", prepared: await board("E = mc²") });
    const comparison = comparePhotoMetrics(first, second);
    expect(comparison.exactPixels).toBe(false);
    expect(comparison.similarity).toBeGreaterThan(0.9);
    // A candidate never removes either photo or claims their semantic board states are equal.
    expect(findPhotoSimilarityCandidates([first, second])).toEqual([comparison]);
    expect([first.imageId, second.imageId]).toEqual(["before", "after"]);
  });
  it("measures blur comparatively while retaining lower-quality photographs", async () => {
    const clear = await board();
    const blurred = await sharp(clear).blur(4).png().toBuffer();
    const first = await analyzePhotoMetrics({ imageId: "clear", prepared: clear });
    const second = await analyzePhotoMetrics({ imageId: "blurred", prepared: blurred });
    expect(first.sharpnessVariance).toBeGreaterThan(second.sharpnessVariance);
    expect(first.sharpnessScore).toBeGreaterThan(second.sharpnessScore);
    expect(first.qualityScore).toBeGreaterThan(second.qualityScore);
    const all = compareAllPhotoMetrics([first, second]);
    expect(all).toHaveLength(1);
    expect(all[0].imageIds).toEqual(["clear", "blurred"]);
  });
  it("does not call differently oriented copies exact pixels just because originals are identical", async () => {
    const photo = await board();
    const rotated = await sharp(photo).rotate(90).png().toBuffer();
    const first = await analyzePhotoMetrics({ imageId: "upright", prepared: photo, original: photo });
    const second = await analyzePhotoMetrics({ imageId: "rotated", prepared: rotated, original: photo });
    expect(comparePhotoMetrics(first, second)).toMatchObject({ sameOriginalFile: true, exactPixels: false });
  });
  it("reports exposure as measured fractions rather than inferred readability or glare", async () => {
    const make = (background: string) => sharp({ create: { width: 80, height: 80, channels: 3, background } }).png().toBuffer();
    const light = await analyzePhotoMetrics({ imageId: "white", prepared: await make("white") });
    const dark = await analyzePhotoMetrics({ imageId: "black", prepared: await make("black") });
    expect(light.clippedLightFraction).toBe(1);
    expect(light.darkPixelFraction).toBe(0);
    expect(dark.darkPixelFraction).toBe(1);
    expect(dark.clippedLightFraction).toBe(0);
    expect(comparePhotoMetrics(light, dark).possibleDuplicate).toBe(false);
    expect(light).not.toHaveProperty("readability");
    expect(light).not.toHaveProperty("glare");
  });
  it("bounds pair comparisons and rejects conflicting identities", async () => {
    const metric = await analyzePhotoMetrics({ imageId: "one", prepared: await board() });
    const twenty = Array.from({ length: 20 }, (_, index) => ({ ...metric, imageId: String(index) }));
    expect(compareAllPhotoMetrics(twenty)).toHaveLength(190);
    expect(() => compareAllPhotoMetrics([...twenty, { ...metric, imageId: "extra" }])).toThrow(/20/);
    expect(() => compareAllPhotoMetrics([metric, metric])).toThrow(/uniquely/);
  });
});

/** Build bounded little-endian TIFF metadata directly to include malformed edge cases. */
function exifDate(date: string, offset?: string) {
  const values = [date + "\0", ...(offset ? [offset + "\0"] : [])];
  const tags = [0x9003, 0x9011];
  const directory = 8;
  const dataStart = directory + 2 + values.length * 12 + 4;
  const bytes = Buffer.alloc(dataStart + values.reduce((sum, value) => sum + value.length, 0));
  bytes.write("II", 0, "ascii"); bytes.writeUInt16LE(42, 2); bytes.writeUInt32LE(directory, 4);
  bytes.writeUInt16LE(values.length, directory);
  let data = dataStart;
  values.forEach((value, index) => {
    const entry = directory + 2 + index * 12;
    bytes.writeUInt16LE(tags[index], entry); bytes.writeUInt16LE(2, entry + 2);
    bytes.writeUInt32LE(value.length, entry + 4); bytes.writeUInt32LE(data, entry + 8);
    bytes.write(value, data, "ascii"); data += value.length;
  });
  return Buffer.concat([Buffer.from("Exif\0\0"), bytes]);
}

describe("EXIF capture-time supporting evidence", () => {
  it("reads the original JPEG's actual ExifIFD after the provider representation strips metadata", async () => {
    const original = await sharp(await board()).withExif({ IFD2: { DateTimeOriginal: "2026:10:24 12:34:56", OffsetTimeOriginal: "+03:00" } }).jpeg().toBuffer();
    const prepared = await sharp(original).jpeg({ quality: 90 }).toBuffer();
    expect((await sharp(prepared).metadata()).exif).toBeUndefined();
    const measured = await analyzePhotoMetrics({ imageId: "camera", prepared, original });
    expect(measured).toMatchObject({ capturedAt: "2026-10-24T09:34:56.000Z", timestampBasis: "EXIF_OFFSET" });
  });
  it("normalizes an explicitly offset capture time but keeps an unknown-zone camera clock unverified", () => {
    expect(readExifCaptureTime(exifDate("2026:10:24 12:34:56", "+03:00"))).toEqual({ capturedAt: "2026-10-24T09:34:56.000Z", timestampBasis: "EXIF_OFFSET" });
    expect(readExifCaptureTime(exifDate("2026:10:24 12:34:56"))).toEqual({ capturedAt: "2026-10-24T12:34:56", timestampBasis: "EXIF_LOCAL_UNVERIFIED" });
  });
  it("does not fabricate capture times from invalid dates or malformed metadata", () => {
    const unavailable = { capturedAt: null, timestampBasis: "UNAVAILABLE" };
    expect(readExifCaptureTime(exifDate("2026:02:31 12:34:56"))).toEqual(unavailable);
    expect(readExifCaptureTime(Buffer.from("not exif"))).toEqual(unavailable);
    expect(readExifCaptureTime(exifDate("2026:10:24 12:34:56", "+99:99"))).toMatchObject({ timestampBasis: "EXIF_LOCAL_UNVERIFIED" });
    const broken = exifDate("2026:10:24 12:34:56");
    broken.writeUInt32LE(0xffffffff, 6 + 8 + 2 + 8);
    expect(readExifCaptureTime(broken)).toEqual(unavailable);
  });
});
