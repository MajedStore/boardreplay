import { z } from "zod";
import { db } from "@/lib/db";
import { api, sameOrigin, ApiError } from "@/lib/api";
import { ensureEditable, getLesson, json } from "@/lib/lessons";
import { reconcileMissingSources } from "@/lib/reconstruction/validate";
import { Prisma } from "@/generated/prisma/client";
import { validateLectureDocument } from "@/lib/lecture-document";
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
    const snapshot = revision.content as { kind?: string; document?: unknown };
    if (snapshot?.kind === "PHOTO_LECTURE") {
      let document;
      try { document = validateLectureDocument(snapshot.document, images.map((image) => image.id)); }
      catch { throw new ApiError("This document revision references unavailable photographs. Your current document is preserved."); }
      await db.$transaction(async (tx) => {
        if (previous.document) await tx.reconstructionRevision.create({ data: { lessonId: id, content: json({ kind: "PHOTO_LECTURE", document: previous.document }), reason: "Before restoring a lecture document" } });
        await tx.lesson.update({ where: { id }, data: { document: json(document), photoOrganization: json(document.organization), status: "COMPLETED", explanationsNeedRefresh: false } });
      });
      return getLesson(id);
    }
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
          photoOrganization: restored.reconstruction.organization ? json(restored.reconstruction.organization) : Prisma.DbNull,
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
