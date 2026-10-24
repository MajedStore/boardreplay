import { z } from "zod";
import { db } from "@/lib/db";
import { api, sameOrigin, ApiError } from "@/lib/api";
import { ensureEditable, getLesson, json } from "@/lib/lessons";
import { reconcileMissingSources } from "@/lib/reconstruction/validate";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    sameOrigin(request);
    const { id } = await params;
    const previous = await ensureEditable(id);
    const { revisionId } = z
      .object({ revisionId: z.string() })
      .parse(await request.json());
    const revision = await db.reconstructionRevision.findFirst({
      where: { id: revisionId, lessonId: id },
    });
    if (!revision) throw new ApiError("Revision not found.", 404);
    const images = await db.lectureImage.findMany({
      where: { lessonId: id },
      select: { id: true },
    });
    let restored;
    try {
      restored = reconcileMissingSources(
        revision.content,
        images.map((image) => image.id),
      );
    } catch {
      throw new ApiError(
        "This revision has invalid lesson structure and could not be restored. Your current notes are preserved.",
      );
    }
    await db.$transaction(async (tx) => {
      if (previous.reconstruction)
        await tx.reconstructionRevision.create({
          data: {
            lessonId: id,
            content: json(previous.reconstruction),
            reason: "Before restoring revision",
          },
        });
      await tx.lesson.update({
        where: { id },
        data: {
          reconstruction: json(restored.reconstruction),
          status: "COMPLETED",
          ...(restored.missingImageIds.length
            ? { needsReprocessing: true }
            : {}),
        },
      });
    });
    return getLesson(id);
  });
}
