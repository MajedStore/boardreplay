import { promises as fs } from "node:fs";
import { db } from "@/lib/db";
import { api, ApiError, sameOrigin, errorResponse } from "@/lib/api";
import { ensureEditable, getLesson, json } from "@/lib/lessons";
import { safeStoragePath, removeStoredImage } from "@/lib/storage/images";
import { z } from "zod";
import type { Reconstruction } from "@/lib/types";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: Request, context: Context) {
  try {
    const image = await db.lectureImage.findUnique({
      where: { id: (await context.params).id },
    });
    if (!image) throw new ApiError("Image not found.", 404);
    const buffer = await fs.readFile(safeStoragePath(image.storagePath));
    return new Response(buffer, {
      headers: {
        "Content-Type": image.mimeType,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  return api(async () => {
    sameOrigin(request);
    const { rotation } = z
      .object({
        rotation: z.union([
          z.literal(0),
          z.literal(90),
          z.literal(180),
          z.literal(270),
        ]),
      })
      .parse(await request.json());
    const image = await db.lectureImage.findUnique({
      where: { id: (await context.params).id },
    });
    if (!image) throw new ApiError("Image not found.", 404);
    await ensureEditable(image.lessonId);
    await db.$transaction([
      db.lectureImage.update({ where: { id: image.id }, data: { rotation } }),
      db.lesson.update({
        where: { id: image.lessonId },
        data: { needsReprocessing: true },
      }),
    ]);
    return getLesson(image.lessonId);
  });
}
export async function DELETE(request: Request, context: Context) {
  return api(async () => {
    sameOrigin(request);
    const image = await db.lectureImage.findUnique({
      where: { id: (await context.params).id },
    });
    if (!image) throw new ApiError("Image not found.", 404);
    const lesson = await ensureEditable(image.lessonId);
    const used = await db.comparisonRun.findMany({
      where: { lessonId: image.lessonId },
      select: { imageSnapshot: true },
    });
    if (
      used.some((r) =>
        (r.imageSnapshot as unknown as { id: string }[]).some(
          (i) => i.id === image.id,
        ),
      )
    )
      throw new ApiError(
        "This image is part of a saved comparison. Delete the comparison before removing its source image.",
        409,
      );
    const content = lesson.reconstruction
      ? (structuredClone(lesson.reconstruction) as unknown as Reconstruction)
      : null;
    if (content) {
      for (const step of content.steps) {
        if (step.sourceImageIds.includes(image.id)) {
          step.sourceImageIds = step.sourceImageIds.filter(
            (id) => id !== image.id,
          );
          step.evidenceStatus = "UNCERTAIN";
          step.uncertainty = [
            step.uncertainty,
            "A referenced original image was removed by the user.",
          ]
            .filter(Boolean)
            .join(" ");
        }
      }
    }
    await db.$transaction(async (tx) => {
      if (lesson.reconstruction)
        await tx.reconstructionRevision.create({
          data: {
            lessonId: lesson.id,
            content: json(lesson.reconstruction),
            reason: "Before removing a source image",
          },
        });
      await tx.lectureImage.delete({ where: { id: image.id } });
      const remaining = await tx.lectureImage.findMany({
        where: { lessonId: image.lessonId },
        orderBy: { sequence: "asc" },
      });
      for (let index = 0; index < remaining.length; index++)
        await tx.lectureImage.update({
          where: { id: remaining[index].id },
          data: { sequence: index },
        });
      await tx.lesson.update({
        where: { id: image.lessonId },
        data: {
          needsReprocessing: true,
          ...(content ? { reconstruction: json(content) } : {}),
          status: content
            ? "COMPLETED"
            : remaining.length
              ? "READY"
              : "PENDING",
        },
      });
    });
    await removeStoredImage(image.storagePath);
    return getLesson(image.lessonId);
  });
}
