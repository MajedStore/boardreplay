import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { ApiError } from "@/lib/api";
export const MAX_IMAGES = 20;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
export const UPLOAD_ROOT = path.resolve(
  /*turbopackIgnore: true*/ process.env.UPLOAD_DIR || "./data/uploads",
);
const mimeToFormat: Record<string, string> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};
export function validateUploadInfo(file: { type: string; size: number }) {
  if (!mimeToFormat[file.type])
    throw new ApiError("Use JPG, PNG, or WebP images.");
  if (file.size === 0)
    throw new ApiError("Empty image files are not supported.");
  if (file.size > MAX_FILE_BYTES)
    throw new ApiError("Each image must be 10 MB or smaller.");
}
export function safeStoragePath(storagePath: string) {
  const resolved = path.resolve(UPLOAD_ROOT, storagePath);
  if (!resolved.startsWith(UPLOAD_ROOT + path.sep))
    throw new ApiError("Invalid file path.", 400);
  return resolved;
}
export async function inspectImage(buffer: Buffer, mimeType: string) {
  try {
    const meta = await sharp(buffer, {
      limitInputPixels: 40_000_000,
      failOn: "error",
    }).metadata();
    if (meta.format !== mimeToFormat[mimeType])
      throw new ApiError("The image contents do not match its MIME type.");
    if (
      !meta.width ||
      !meta.height ||
      meta.width < 40 ||
      meta.height < 40 ||
      (meta.pages ?? 1) > 1
    )
      throw new ApiError(
        "Use a single-frame board image at least 40 × 40 pixels.",
      );
    await sharp(buffer, { limitInputPixels: 40_000_000, failOn: "error" })
      .resize(32, 32)
      .raw()
      .toBuffer();
    // Browser display and prepared provider images both honor camera EXIF orientation.
    const swapped = [5, 6, 7, 8].includes(meta.orientation ?? 1);
    return {
      width: swapped ? meta.height : meta.width,
      height: swapped ? meta.width : meta.height,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "This image is corrupt, too large in dimensions, or cannot be decoded.",
    );
  }
}
export async function storeImage(buffer: Buffer, mimeType: string) {
  const metadata = await inspectImage(buffer, mimeType);
  await fs.mkdir(UPLOAD_ROOT, { recursive: true });
  const storagePath = `${randomUUID()}.${mimeToFormat[mimeType]}`;
  await fs.writeFile(safeStoragePath(storagePath), buffer, { flag: "wx" });
  return { ...metadata, storagePath };
}
export async function removeStoredImage(storagePath: string) {
  await fs.rm(safeStoragePath(storagePath), { force: true });
}
export async function imageForAI(image: {
  id: string;
  storagePath: string;
  rotation: number;
  sequence: number;
}) {
  const { data: buffer, info } = await sharp(
    safeStoragePath(image.storagePath),
    {
      limitInputPixels: 40_000_000,
    },
  )
    .autoOrient()
    .rotate(image.rotation)
    .resize({
      width: 2200,
      height: 2200,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 90 })
    .toBuffer({ resolveWithObject: true });
  return {
    id: image.id,
    mimeType: "image/jpeg",
    base64: buffer.toString("base64"),
    sequence: image.sequence,
    width: info.width,
    height: info.height,
  };
}
