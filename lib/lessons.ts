import "server-only";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import type { Lesson, Reconstruction, ComparisonRun } from "@/lib/types";
import type { Prisma } from "@/generated/prisma/client";
import {
  hasActiveLessonOperation,
  recoverInterruptedOperation,
} from "@/lib/operations";
export function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
export const lessonInclude = {
  images: { orderBy: { sequence: "asc" as const } },
  revisions: {
    select: { id: true, createdAt: true, reason: true },
    orderBy: { createdAt: "desc" as const },
  },
  runs: { orderBy: { startedAt: "desc" as const }, take: 10 },
};
export function serializeLesson(
  row: Prisma.LessonGetPayload<{ include: typeof lessonInclude }>,
): Lesson {
  return {
    ...row,
    status: row.status as Lesson["status"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    reconstruction: row.reconstruction as unknown as Reconstruction | null,
    images: row.images.map((image) => ({
      id: image.id,
      lessonId: image.lessonId,
      originalFilename: image.originalFilename,
      sequence: image.sequence,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
      rotation: image.rotation,
      uploadedAt: image.uploadedAt.toISOString(),
      url: `/api/images/${image.id}`,
    })),
    revisions: row.revisions.map((revision) => ({
      ...revision,
      createdAt: revision.createdAt.toISOString(),
    })),
    runs: row.runs.map((run) => ({
      id: run.id,
      status: run.status,
      provider: run.provider,
      model: run.model,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
      error: run.error,
    })),
  };
}
export async function getLesson(id: string) {
  await recoverInterruptedOperation(id);
  const row = await db.lesson.findUnique({
    where: { id },
    include: lessonInclude,
  });
  if (!row) throw new ApiError("Lesson not found.", 404);
  return serializeLesson(row);
}
export async function ensureEditable(id: string) {
  await recoverInterruptedOperation(id);
  const lesson = await db.lesson.findUnique({ where: { id } });
  if (!lesson) throw new ApiError("Lesson not found.", 404);
  if (
    hasActiveLessonOperation(id) ||
    ["EXTRACTING", "RECONSTRUCTING", "UPLOADING"].includes(lesson.status)
  )
    throw new ApiError(
      "Wait for the current upload, reconstruction, or benchmark to finish.",
      409,
    );
  return lesson;
}
export function validateOrder(ids: string[], existingIds: string[]) {
  return (
    ids.length === existingIds.length &&
    new Set(ids).size === ids.length &&
    ids.every((id) => existingIds.includes(id))
  );
}
export const comparisonInclude = {
  results: { orderBy: { createdAt: "asc" as const } },
};
export function serializeComparison(
  row: Prisma.ComparisonRunGetPayload<{ include: typeof comparisonInclude }>,
): ComparisonRun {
  const imageSnapshot =
    row.imageSnapshot as unknown as ComparisonRun["imageSnapshot"];
  return {
    ...row,
    imageSnapshot,
    imageIds: imageSnapshot.map((i) => i.id),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    results: row.results.map((r) => ({
      ...r,
      provider: r.provider as ComparisonRun["results"][number]["provider"],
      mode: r.mode as "AUTOMATIC" | "MANUAL",
      createdAt: r.createdAt.toISOString(),
      scores: r.scores as unknown as ComparisonRun["results"][number]["scores"],
    })),
  };
}
