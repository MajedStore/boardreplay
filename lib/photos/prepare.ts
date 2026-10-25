import "server-only";
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { imageForAI, safeStoragePath } from "../storage/images";
import { analyzePhotoMetrics, PHOTO_METRICS_VERSION, type PhotoMetrics } from "./metrics";

interface PreparedSource { id: string; storagePath: string; rotation: number; sequence: number }
interface Checkpoints { get(key: string): Promise<unknown | null>; set(key: string, value: unknown): Promise<void> }
/** Decode at most two original photos at once; keep provider inputs fitted to 2200px. */
export async function preparePhotoSet(images: PreparedSource[], cache: Checkpoints) {
  const results: { image: Awaited<ReturnType<typeof imageForAI>>; metrics: PhotoMetrics }[] = new Array(images.length);
  let next = 0;
  async function worker() {
    while (next < images.length) {
      const index = next++;
      const source = images[index];
      const original = await fs.readFile(safeStoragePath(source.storagePath));
      const originalHash = createHash("sha256").update(original).digest("hex");
      const image = await imageForAI(source);
      const key = `pixels:${PHOTO_METRICS_VERSION}:${originalHash}:${source.rotation}`;
      const saved = await cache.get(key) as PhotoMetrics | null;
      const prepared = Buffer.from(image.base64, "base64");
      const preparedHash = createHash("sha256").update(prepared).digest("hex");
      const metrics = saved?.version === PHOTO_METRICS_VERSION && saved.preparedSha256 === preparedHash
        ? { ...saved, imageId: source.id }
        : await analyzePhotoMetrics({ imageId: source.id, original, prepared });
      if (!saved || saved.preparedSha256 !== preparedHash) await cache.set(key, metrics);
      results[index] = { image, metrics };
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, images.length) }, worker));
  return { images: results.map((item) => item.image), photoMetrics: results.map((item) => item.metrics) };
}
