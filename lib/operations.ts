import "server-only";
import { db } from "./db";
import { ApiError } from "./api";

type OperationKind = "upload" | "processing" | "benchmark";
const state = globalThis as unknown as {
  boardReplayOperations?: Map<string, Map<symbol, OperationKind>>;
};
// Keep active work across development module reloads. A process restart intentionally clears it.
const operations = (state.boardReplayOperations ??= new Map<
  string,
  Map<symbol, OperationKind>
>());
const busyStatuses = ["UPLOADING", "ANALYZING", "EXTRACTING", "FINDING_DUPLICATES", "ORGANIZING", "RECONSTRUCTING"];

export function hasActiveLessonOperation(lessonId: string): boolean {
  return Boolean(operations.get(lessonId)?.size);
}

export function beginLessonOperation(
  lessonId: string,
  kind: OperationKind,
): symbol {
  const active = operations.get(lessonId);
  // Benchmarks may read the same immutable source set concurrently; editing stays locked.
  if (
    active?.size &&
    (kind !== "benchmark" ||
      [...active.values()].some((value) => value !== "benchmark"))
  ) {
    throw new ApiError(
      "Wait for the current upload, reconstruction, or benchmark to finish.",
      409,
    );
  }
  const token = Symbol(kind);
  const entry = active ?? new Map<symbol, OperationKind>();
  entry.set(token, kind);
  operations.set(lessonId, entry);
  return token;
}

export function endLessonOperation(lessonId: string, token: symbol): void {
  const entry = operations.get(lessonId);
  entry?.delete(token);
  if (entry?.size === 0) operations.delete(lessonId);
}

/** A saved busy state without live work means the local server was interrupted. */
export async function recoverInterruptedOperation(
  lessonId: string,
): Promise<void> {
  if (hasActiveLessonOperation(lessonId)) return;
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: { status: true, updatedAt: true },
  });
  if (
    !lesson ||
    !busyStatuses.includes(lesson.status) ||
    hasActiveLessonOperation(lessonId)
  )
    return;
  const message =
    "The local server stopped before this operation finished. Your saved photographs and previous notes are preserved. Retry the upload or reconstruction.";
  await db.$transaction(async (tx) => {
    if (hasActiveLessonOperation(lessonId)) return;
    const changed = await tx.lesson.updateMany({
      where: {
        id: lessonId,
        status: lesson.status,
        updatedAt: lesson.updatedAt,
      },
      data: { status: "FAILED", error: message },
    });
    if (changed.count)
      await tx.processingRun.updateMany({
        where: { lessonId, status: { in: busyStatuses.filter((status) => status !== "UPLOADING") } },
        data: { status: "FAILED", error: message, completedAt: new Date() },
      });
  });
}

export async function recoverInterruptedOperations(): Promise<void> {
  const lessons = await db.lesson.findMany({
    where: { status: { in: busyStatuses } },
    select: { id: true },
  });
  for (const lesson of lessons) await recoverInterruptedOperation(lesson.id);
}
