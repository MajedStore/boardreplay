import { db } from "@/lib/db";
import { api, sameOrigin, ApiError } from "@/lib/api";
import { ensureEditable, getLesson, json } from "@/lib/lessons";
import {
  lessonInputSchema,
  reconstructionSchema,
} from "@/lib/validation/schemas";
import { validateReconstruction } from "@/lib/reconstruction/validate";
import { removeStoredImage } from "@/lib/storage/images";
import type { Reconstruction } from "@/lib/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: Request, context: Context) {
  return api(async () => getLesson((await context.params).id));
}
export async function PATCH(request: Request, context: Context) {
  return api(async () => {
    sameOrigin(request);
    const { id } = await context.params;
    const previous = await ensureEditable(id);
    const body = await request.json();
    if (body.reconstruction) {
      const images = await db.lectureImage.findMany({
        where: { lessonId: id },
      });
      let reconstruction;
      try {
        reconstruction = validateReconstruction(
          reconstructionSchema.parse(body.reconstruction),
          images.map((i) => i.id),
        );
      } catch {
        throw new ApiError(
          "Invalid reconstruction. Check section IDs, step IDs, and source references.",
        );
      }
      const old = previous.reconstruction as unknown as Reconstruction | null;
      for (const step of reconstruction.steps) {
        const before = old?.steps.find((s) => s.id === step.id);
        if (
          !before ||
          [
            "text",
            "latex",
            "evidenceStatus",
            "type",
            "uncertainty",
            "explanation",
            "sourceImageIds",
          ].some(
            (key) =>
              JSON.stringify(before[key as keyof typeof before]) !==
              JSON.stringify(step[key as keyof typeof step]),
          )
        ) {
          step.evidenceStatus = "USER_EDITED";
          step.originalText =
            before?.originalText ?? before?.text ?? step.originalText ?? null;
          step.verification = {
            status: "NOT_VERIFIED",
            message: "User correction; not independently verified.",
          };
        }
      }
      await db.$transaction(async (tx) => {
        if (previous.reconstruction)
          await tx.reconstructionRevision.create({
            data: {
              lessonId: id,
              content: json(previous.reconstruction),
              reason: "Before manual edit",
            },
          });
        await tx.lesson.update({
          where: { id },
          data: { reconstruction: json(reconstruction), status: "COMPLETED" },
        });
      });
    } else {
      const data = lessonInputSchema.partial().parse(body);
      if (Object.keys(data).length === 0)
        throw new ApiError("No lesson changes were provided.");
      await db.lesson.update({ where: { id }, data });
    }
    return getLesson(id);
  });
}
export async function DELETE(request: Request, context: Context) {
  return api(async () => {
    sameOrigin(request);
    const { id } = await context.params;
    await ensureEditable(id);
    const images = await db.lectureImage.findMany({ where: { lessonId: id } });
    await db.lesson.delete({ where: { id } });
    await Promise.all(images.map((i) => removeStoredImage(i.storagePath)));
    return { deleted: true };
  });
}
