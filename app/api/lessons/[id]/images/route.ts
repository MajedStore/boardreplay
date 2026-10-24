import { db } from "@/lib/db";
import { api, ApiError, sameOrigin, limit } from "@/lib/api";
import { ensureEditable, getLesson, validateOrder } from "@/lib/lessons";
import {
  MAX_IMAGES,
  MAX_UPLOAD_BYTES,
  storeImage,
  removeStoredImage,
  validateUploadInfo,
} from "@/lib/storage/images";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { beginLessonOperation, endLessonOperation } from "@/lib/operations";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  return api(async () => {
    sameOrigin(request);
    limit("upload", 15);
    if (
      Number(request.headers.get("content-length") ?? 0) >
      MAX_UPLOAD_BYTES + 100_000
    )
      throw new ApiError("Upload at most 100 MB per batch.", 413);
    const { id } = await context.params;
    const previous = await ensureEditable(id);
    const operation = beginLessonOperation(id, "upload");
    try {
      const locked = await db.lesson.updateMany({
        where: {
          id,
          status: { notIn: ["UPLOADING", "EXTRACTING", "RECONSTRUCTING"] },
        },
        data: { status: "UPLOADING" },
      });
      if (!locked.count)
        throw new ApiError(
          "Another upload or processing operation is running.",
          409,
        );
      const stored: string[] = [];
      try {
        const form = await request.formData();
        const files = form
          .getAll("files")
          .filter((f): f is File => f instanceof File);
        const existing = await db.lectureImage.count({
          where: { lessonId: id },
        });
        if (files.length === 0)
          throw new ApiError("Select at least one image.");
        if (existing + files.length > MAX_IMAGES)
          throw new ApiError(`A lesson can have at most ${MAX_IMAGES} images.`);
        if (files.reduce((sum, f) => sum + f.size, 0) > MAX_UPLOAD_BYTES)
          throw new ApiError("Upload at most 100 MB per batch.");
        files.forEach(validateUploadInfo);
        const rows: Prisma.LectureImageCreateManyInput[] = [];
        for (let index = 0; index < files.length; index++) {
          const file = files[index];
          const info = await storeImage(
            Buffer.from(await file.arrayBuffer()),
            file.type,
          );
          stored.push(info.storagePath);
          rows.push({
            lessonId: id,
            originalFilename: file.name
              .replace(/[\x00-\x1f]/g, "")
              .slice(0, 240),
            sequence: existing + index,
            mimeType: file.type,
            ...info,
          });
        }
        await db.$transaction(async (tx) => {
          await tx.lectureImage.createMany({ data: rows });
          await tx.lesson.update({
            where: { id },
            data: {
              status: previous.reconstruction ? "COMPLETED" : "READY",
              needsReprocessing: !!previous.reconstruction,
              error: null,
            },
          });
        });
        return getLesson(id);
      } catch (error) {
        await Promise.allSettled(stored.map(removeStoredImage));
        await db.lesson.update({
          where: { id },
          data: { status: previous.status },
        });
        throw error;
      }
    } finally {
      endLessonOperation(id, operation);
    }
  });
}
export async function PATCH(request: Request, context: Context) {
  return api(async () => {
    sameOrigin(request);
    const { id } = await context.params;
    await ensureEditable(id);
    const { imageIds } = z
      .object({ imageIds: z.array(z.string()).max(MAX_IMAGES) })
      .parse(await request.json());
    const images = await db.lectureImage.findMany({ where: { lessonId: id } });
    if (
      !validateOrder(
        imageIds,
        images.map((i) => i.id),
      )
    )
      throw new ApiError("The order must include every image exactly once.");
    await db.$transaction(async (tx) => {
      for (let index = 0; index < imageIds.length; index++)
        await tx.lectureImage.update({
          where: { id: imageIds[index] },
          data: { sequence: index },
        });
      await tx.lesson.update({
        where: { id },
        data: { needsReprocessing: true },
      });
    });
    return getLesson(id);
  });
}
