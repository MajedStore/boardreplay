import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";

export const PHOTO_METRICS_VERSION = "photo-metrics-v1" as const;

/** Pixel measurements are screening hints, not evidence of readability or an empty board. */
export interface PhotoMetrics {
  version: typeof PHOTO_METRICS_VERSION;
  imageId: string;
  originalSha256: string | null;
  preparedSha256: string;
  pixelSha256: string;
  perceptualHash: string;
  averageHash: string;
  width: number;
  height: number;
  sharpnessVariance: number;
  sharpnessScore: number;
  darkPixelFraction: number;
  clippedLightFraction: number;
  meanLuminance: number;
  qualityScore: number;
  /** With no offset, this is an unverified local camera clock, never a UTC instant. */
  capturedAt: string | null;
  timestampBasis: "EXIF_OFFSET" | "EXIF_LOCAL_UNVERIFIED" | "UNAVAILABLE";
}

export interface PhotoSimilarity {
  imageIds: [string, string];
  exactPixels: boolean;
  sameOriginalFile: boolean;
  similarity: number;
  /** A candidate for visual semantic comparison. This never establishes the same board state. */
  possibleDuplicate: boolean;
}

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const rounded = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** A deliberately bounded TIFF reader for DateTimeOriginal and its own UTC offset. */
export function readExifCaptureTime(exif?: Buffer): Pick<PhotoMetrics, "capturedAt" | "timestampBasis"> {
  const unavailable = { capturedAt: null, timestampBasis: "UNAVAILABLE" as const };
  if (!exif || exif.length < 8) return unavailable;
  const base = exif.subarray(0, 6).equals(Buffer.from("Exif\0\0")) ? 6 : 0;
  const byteOrder = exif.subarray(base, base + 2).toString("ascii");
  if (byteOrder !== "II" && byteOrder !== "MM") return unavailable;
  const little = byteOrder === "II";
  function uint16(offset: number) {
    if (offset < base || offset + 2 > exif!.length) return null;
    return little ? exif!.readUInt16LE(offset) : exif!.readUInt16BE(offset);
  }
  function uint32(offset: number) {
    if (offset < base || offset + 4 > exif!.length) return null;
    return little ? exif!.readUInt32LE(offset) : exif!.readUInt32BE(offset);
  }
  if (uint16(base + 2) !== 42) return unavailable;
  const firstOffset = uint32(base + 4);
  if (firstOffset == null) return unavailable;
  const tags = new Map<number, string>();
  const seen = new Set<number>();
  function directory(relative: number, depth: number) {
    if (depth > 2 || seen.has(relative)) return;
    seen.add(relative);
    const start = base + relative;
    const count = uint16(start);
    if (count == null || count > 256 || start + 2 + count * 12 > exif!.length) return;
    for (let index = 0; index < count; index++) {
      const entry = start + 2 + index * 12;
      const tag = uint16(entry), type = uint16(entry + 2), length = uint32(entry + 4);
      if (tag === 0x8769 && type === 4 && length === 1) {
        const child = uint32(entry + 8);
        if (child != null) directory(child, depth + 1);
      }
      if ((tag !== 0x9003 && tag !== 0x9011) || type !== 2 || length == null || length < 1 || length > 128) continue;
      const relativeValue = length <= 4 ? null : uint32(entry + 8);
      if (length > 4 && relativeValue == null) continue;
      const position = length <= 4 ? entry + 8 : base + relativeValue!;
      if (position < base || position + length > exif!.length) continue;
      tags.set(tag, exif!.subarray(position, position + length).toString("ascii").replace(/\0.*$/, "").trim());
    }
  }
  directory(firstOffset, 0);
  const captured = tags.get(0x9003);
  if (!captured || !/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(captured)) return unavailable;
  const local = `${captured.slice(0, 4)}-${captured.slice(5, 7)}-${captured.slice(8, 10)}T${captured.slice(11)}`;
  const calendar = new Date(`${local}Z`);
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 19) !== local) return unavailable;
  const offset = tags.get(0x9011);
  if (!offset || !/^[+-]\d{2}:\d{2}$/.test(offset)) return { capturedAt: local, timestampBasis: "EXIF_LOCAL_UNVERIFIED" };
  const hours = Number(offset.slice(1, 3)), minutes = Number(offset.slice(4));
  if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return { capturedAt: local, timestampBasis: "EXIF_LOCAL_UNVERIFIED" };
  const instant = new Date(local + offset);
  return Number.isFinite(instant.getTime()) ? { capturedAt: instant.toISOString(), timestampBasis: "EXIF_OFFSET" } : unavailable;
}

function hashBits(bits: boolean[]) {
  let result = "";
  for (let index = 0; index < bits.length; index += 4) {
    let nibble = 0;
    for (let bit = 0; bit < 4; bit++) nibble = nibble * 2 + Number(bits[index + bit]);
    result += nibble.toString(16);
  }
  return result;
}

export async function analyzePhotoMetrics(input: { imageId: string; prepared: Buffer; original?: Buffer }): Promise<PhotoMetrics> {
  if (!input.imageId || !input.prepared.length) throw new Error("Image metrics require a prepared photograph and its identity.");
  // Prepared representations already fit 2200 x 2200; independently bound decoding here.
  const source = sharp(input.prepared, { limitInputPixels: 5_000_000, failOn: "error" });
  const [{ data: pixels, info }, { data: gray, info: sample }, originalMetadata] = await Promise.all([
    source.clone().toColourspace("srgb").removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    source.clone().resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true }).greyscale().raw().toBuffer({ resolveWithObject: true }),
    input.original ? sharp(input.original, { limitInputPixels: 40_000_000, failOn: "error" }).metadata() : Promise.resolve(null),
  ]);
  const sampleImage = sharp(gray, { raw: { width: sample.width, height: sample.height, channels: 1 } });
  const [differenceGrid, averageGrid] = await Promise.all([
    sampleImage.clone().resize(17, 16, { fit: "fill" }).greyscale().raw().toBuffer(),
    sampleImage.clone().resize(16, 16, { fit: "fill" }).greyscale().raw().toBuffer(),
  ]);
  const differences: boolean[] = [];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) differences.push(differenceGrid[y * 17 + x] > differenceGrid[y * 17 + x + 1]);
  const average = averageGrid.reduce((sum, value) => sum + value, 0) / averageGrid.length;
  let dark = 0, clipped = 0, luminance = 0;
  for (const value of gray) { if (value <= 12) dark++; if (value >= 250) clipped++; luminance += value; }
  let edgeSum = 0, edgeSquareSum = 0, edgeCount = 0;
  for (let y = 1; y < sample.height - 1; y++) for (let x = 1; x < sample.width - 1; x++) {
    const index = y * sample.width + x;
    const value = gray[index - sample.width] + gray[index + sample.width] + gray[index - 1] + gray[index + 1] - 4 * gray[index];
    edgeSum += value; edgeSquareSum += value * value; edgeCount++;
  }
  const variance = edgeCount ? Math.max(0, edgeSquareSum / edgeCount - (edgeSum / edgeCount) ** 2) : 0;
  const sharpnessScore = 1 - Math.exp(-variance / 300);
  const darkFraction = dark / gray.length, lightFraction = clipped / gray.length;
  // Blank whiteboards naturally contain many white pixels. This score is only a ranking hint
  // between semantically equivalent views; it must never cause omission of a photo or state.
  const qualityScore = clamp((0.25 + 0.75 * sharpnessScore) * (1 - 0.4 * darkFraction) * (1 - 0.1 * lightFraction));
  const exactPixels = createHash("sha256").update(`${info.width}x${info.height}x${info.channels}:`).update(pixels).digest("hex");
  return {
    version: PHOTO_METRICS_VERSION, imageId: input.imageId,
    originalSha256: input.original ? sha256(input.original) : null,
    preparedSha256: sha256(input.prepared), pixelSha256: exactPixels,
    perceptualHash: hashBits(differences), averageHash: hashBits([...averageGrid].map((value) => value >= average)),
    width: info.width, height: info.height,
    sharpnessVariance: rounded(variance), sharpnessScore: rounded(sharpnessScore),
    darkPixelFraction: rounded(darkFraction), clippedLightFraction: rounded(lightFraction),
    meanLuminance: rounded(luminance / gray.length), qualityScore: rounded(qualityScore),
    ...readExifCaptureTime(originalMetadata?.exif),
  };
}

function hashSimilarity(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) throw new Error("Invalid perceptual image hash.");
  let different = 0;
  for (let index = 0; index < left.length; index++) {
    let xor = Number.parseInt(left[index], 16) ^ Number.parseInt(right[index], 16);
    while (xor) { different += xor & 1; xor >>>= 1; }
  }
  return 1 - different / 256;
}

export function comparePhotoMetrics(left: PhotoMetrics, right: PhotoMetrics): PhotoSimilarity {
  const exactPixels = left.width === right.width && left.height === right.height && left.pixelSha256 === right.pixelSha256;
  const similarity = rounded(clamp(0.55 * hashSimilarity(left.perceptualHash, right.perceptualHash) + 0.35 * hashSimilarity(left.averageHash, right.averageHash) + 0.1 * (1 - Math.abs(left.meanLuminance - right.meanLuminance) / 255)));
  return { imageIds: [left.imageId, right.imageId], exactPixels, sameOriginalFile: !!left.originalSha256 && left.originalSha256 === right.originalSha256, similarity, possibleDuplicate: exactPixels || similarity >= 0.94 };
}

/** At most 190 comparisons at the existing 20-photo upload limit. */
export function compareAllPhotoMetrics(metrics: PhotoMetrics[]): PhotoSimilarity[] {
  if (metrics.length > 20 || new Set(metrics.map((item) => item.imageId)).size !== metrics.length) throw new Error("Analyze up to 20 uniquely identified photographs.");
  const pairs: PhotoSimilarity[] = [];
  for (let left = 0; left < metrics.length; left++) for (let right = left + 1; right < metrics.length; right++) pairs.push(comparePhotoMetrics(metrics[left], metrics[right]));
  return pairs;
}

export function findPhotoSimilarityCandidates(metrics: PhotoMetrics[]) {
  return compareAllPhotoMetrics(metrics).filter((pair) => pair.possibleDuplicate);
}
