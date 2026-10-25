import { after, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { ApiError, errorResponse, sameOrigin, limit } from "@/lib/api";
import { ensureEditable, json } from "@/lib/lessons";
import { providerIdSchema } from "@/lib/validation/schemas";
import { getProviders, explainLesson } from "@/lib/ai";
import { beginLessonOperation, endLessonOperation } from "@/lib/operations";
import { validateLectureDocument } from "@/lib/lecture-document";
import type { LectureDocument } from "@/lib/types";
import { analysisCache } from "@/lib/photos/cache";
import { preparePhotoSet } from "@/lib/photos/prepare";
export const runtime = "nodejs";
export const maxDuration = 900;
const busy = ["UPLOADING", "ANALYZING", "EXTRACTING", "FINDING_DUPLICATES", "ORGANIZING", "RECONSTRUCTING"];
const inputSchema = z.object({ provider: providerIdSchema.optional(), orderMode: z.enum(["AUTO", "MANUAL"]).default("AUTO"), forceRefresh: z.boolean().default(false) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let operation: symbol | undefined;
  let operationLessonId: string | undefined;
  let scheduled = false;
  try {
    sameOrigin(request);
    limit("process", 8);
    const { id } = await params;
    const lesson = await ensureEditable(id);
    const body = inputSchema.parse(await request.json());
    const provider = body.provider || getProviders().find((item) => item.configured)?.id;
    const info = getProviders().find((item) => item.id === provider);
    if (!provider || !info?.configured) throw new ApiError("Connect an AI provider to analyze your photos. Open Connect AI to save a server-side key, or try the separately labeled synthetic demo.");
    let images = await db.lectureImage.findMany({ where: { lessonId: id }, orderBy: { sequence: "asc" } });
    if (body.orderMode === "MANUAL" && lesson.document) {
      const corrected = (lesson.document as unknown as LectureDocument).photos.map((photo) => photo.imageId);
      images = [...images].sort((left, right) => {
        const a = corrected.indexOf(left.id), b = corrected.indexOf(right.id);
        return (a < 0 ? corrected.length + left.sequence : a) - (b < 0 ? corrected.length + right.sequence : b);
      }).map((image, sequence) => ({ ...image, sequence }));
    }
    if (!images.length) throw new ApiError("Upload at least one valid board photo first.");
    const organizationMode = body.orderMode === "MANUAL" ? "MANUAL" : "AUTOMATIC";
    operation = beginLessonOperation(id, "processing");
    operationLessonId = id;
    const claimed = await db.lesson.updateMany({
      where: { id, status: { notIn: busy } },
      data: { status: "ANALYZING", error: null, organizationMode, photoOrganization: Prisma.DbNull },
    });
    if (!claimed.count) throw new ApiError("Processing is already running.", 409);
    let run;
    try {
      run = await db.processingRun.create({ data: { lessonId: id, status: "ANALYZING", provider, model: info.model, imageSnapshot: json(images.map((image) => ({ id: image.id, sequence: image.sequence, rotation: image.rotation }))) } });
    } catch (failure) {
      await db.lesson.update({ where: { id }, data: { status: lesson.status, organizationMode: lesson.organizationMode, photoOrganization: lesson.photoOrganization ?? Prisma.DbNull } });
      throw failure;
    }
    after(async () => {
      try {
        const cache = analysisCache(id, body.forceRefresh);
        const prepared = await preparePhotoSet(images, cache);
        const result = await explainLesson({
          lesson: { title: lesson.title, course: lesson.course, topic: lesson.topic, language: lesson.language, instructions: lesson.instructions },
          images: prepared.images, provider, organizationMode, photoMetrics: prepared.photoMetrics, cache,
          onStage: async (stage) => {
            await db.$transaction([
              db.lesson.update({ where: { id }, data: { status: stage } }),
              db.processingRun.update({ where: { id: run.id }, data: { status: stage } }),
            ]);
          },
          onOrganization: async (organization) => {
            await db.$transaction([
              db.lesson.update({ where: { id }, data: { photoOrganization: json(organization) } }),
              db.processingRun.update({ where: { id: run.id }, data: { organization: json(organization) } }),
            ]);
          },
          onExtraction: async (observation) => {
            const position = images.findIndex((image) => image.id === observation.imageId);
            if (position < 0) throw new Error("Observation references a source outside this processing run.");
            const updated = await db.extractionResult.updateMany({ where: { runId: run.id, position }, data: { content: json(observation) } });
            if (!updated.count) await db.extractionResult.create({ data: { runId: run.id, position, content: json(observation) } });
          },
        });
        const content = validateLectureDocument({ ...result.document, photos: result.document.photos.map((photo) => {
          const image = prepared.images.find((source) => source.id === photo.imageId)!;
          return { ...photo, rotation: images.find((source) => source.id === photo.imageId)!.rotation, imageAspectRatio: image.width / image.height };
        }) }, images.map((image) => image.id));
        await db.$transaction(async (tx) => {
          if (lesson.document) await tx.reconstructionRevision.create({ data: { lessonId: id, reason: "Before regenerating explanations", content: json({ kind: "PHOTO_LECTURE", document: lesson.document }) } });
          for (const [position, extraction] of result.extractions.entries()) {
            const updated = await tx.extractionResult.updateMany({ where: { runId: run.id, position }, data: { content: json(extraction) } });
            if (!updated.count) await tx.extractionResult.create({ data: { runId: run.id, position, content: json(extraction) } });
          }
          await tx.lesson.update({ where: { id }, data: { status: "COMPLETED", error: null, document: json(content), ...(result.organization ? { photoOrganization: json(result.organization) } : {}), needsReprocessing: false, explanationsNeedRefresh: false, isDemo: false } });
          await tx.processingRun.update({ where: { id: run.id }, data: { status: "COMPLETED", completedAt: new Date(), provider: result.provider, model: result.model, ...(result.organization ? { organization: json(result.organization) } : {}) } });
        });
      } catch (failure) {
        const safe = failure instanceof Error && failure.name === "AiError" ? failure.message : "Lecture explanations could not finish. Your photos, completed analysis, and previous document are saved. Retry or choose another AI connection.";
        await db.$transaction([
          db.lesson.update({ where: { id }, data: { status: "FAILED", error: safe } }),
          db.processingRun.update({ where: { id: run.id }, data: { status: "FAILED", error: safe, completedAt: new Date() } }),
        ]);
      } finally { if (operation) endLessonOperation(id, operation); }
    });
    scheduled = true;
    return NextResponse.json({ status: "ANALYZING", runId: run.id }, { status: 202 });
  } catch (failure) {
    if (operation && operationLessonId && !scheduled) endLessonOperation(operationLessonId, operation);
    return errorResponse(failure);
  }
}
