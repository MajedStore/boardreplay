import "server-only";
import { db } from "../db";
import { json } from "../lessons";

/** Durable lesson-scoped checkpoints survive later provider failures and server restarts. */
export function analysisCache(lessonId: string, ignoreSaved = false) {
  return {
    async get(key: string): Promise<unknown | null> {
      if (ignoreSaved) return null;
      const row = await db.photoAnalysisCache.findUnique({ where: { lessonId_key: { lessonId, key } } });
      return row?.content ?? null;
    },
    async set(key: string, value: unknown): Promise<void> {
      const encoded = JSON.stringify(value);
      if (!key || key.length > 500 || !encoded || encoded.length > 2_000_000) throw new Error("Analysis checkpoint exceeds the local storage limit.");
      await db.photoAnalysisCache.upsert({
        where: { lessonId_key: { lessonId, key } },
        create: { lessonId, key, content: json(value) },
        update: { content: json(value) },
      });
    },
  };
}
