import { after, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError, errorResponse, sameOrigin, limit } from "@/lib/api";
import { ensureEditable, json } from "@/lib/lessons";
import { providerIdSchema } from "@/lib/validation/schemas";
import { imageForAI } from "@/lib/storage/images";
import { getProviders, reconstructLesson } from "@/lib/ai";
import { beginLessonOperation, endLessonOperation } from "@/lib/operations";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let operation: symbol | undefined;
  let operationLessonId: string | undefined;
  let scheduled = false;
  try {
    sameOrigin(request);
    limit("process", 8);
    const { id } = await params;
    const lesson = await ensureEditable(id);
    const body = await request.json();
    const provider = providerIdSchema.parse(body.provider);
    const info = getProviders().find((p) => p.id === provider);
    if (!info?.configured)
      throw new ApiError(
        "This provider is not configured. Add its server-side API key to .env and restart. The sample lesson is available without credentials.",
      );
    const images = await db.lectureImage.findMany({
      where: { lessonId: id },
      orderBy: { sequence: "asc" },
    });
    if (!images.length)
      throw new ApiError("Upload at least one board image first.");
    operation = beginLessonOperation(id, "processing");
    operationLessonId = id;
    const claim = await db.lesson.updateMany({
      where: {
        id,
        status: { notIn: ["EXTRACTING", "RECONSTRUCTING", "UPLOADING"] },
      },
      data: { status: "EXTRACTING", error: null },
    });
    if (!claim.count) throw new ApiError("Processing is already running.", 409);
    let run;
    try {
      run = await db.processingRun.create({
        data: {
          lessonId: id,
          status: "EXTRACTING",
          provider,
          model: info.model,
          imageSnapshot: json(
            images.map((i) => ({
              id: i.id,
              sequence: i.sequence,
              rotation: i.rotation,
            })),
          ),
        },
      });
    } catch (error) {
      await db.lesson.update({
        where: { id },
        data: { status: lesson.status },
      });
      throw error;
    }
    after(async () => {
      try {
        const input = await Promise.all(images.map(imageForAI));
        const result = await reconstructLesson({
          lesson,
          images: input,
          provider,
          onStage: async (stage) => {
            await db.$transaction([
              db.lesson.update({ where: { id }, data: { status: stage } }),
              db.processingRun.update({
                where: { id: run.id },
                data: { status: stage },
              }),
            ]);
          },
        });
        await db.$transaction(async (tx) => {
          if (lesson.reconstruction)
            await tx.reconstructionRevision.create({
              data: {
                lessonId: id,
                reason: "Before AI reconstruction (previous edits preserved)",
                content: json(lesson.reconstruction),
              },
            });
          for (
            let position = 0;
            position < result.extractions.length;
            position++
          )
            await tx.extractionResult.create({
              data: {
                runId: run.id,
                position,
                content: json(result.extractions[position]),
              },
            });
          await tx.lesson.update({
            where: { id },
            data: {
              status: "COMPLETED",
              error: null,
              reconstruction: json(result.reconstruction),
              needsReprocessing: false,
              isDemo: false,
            },
          });
          await tx.processingRun.update({
            where: { id: run.id },
            data: {
              status: "COMPLETED",
              completedAt: new Date(),
              provider: result.provider,
              model: result.model,
            },
          });
        });
      } catch (error) {
        const safe =
          error instanceof Error && error.name === "AiError"
            ? error.message
            : "Reconstruction failed. Check provider configuration, quota, connection, and image readability; then retry. Your previous notes are preserved.";
        await db.$transaction([
          db.lesson.update({
            where: { id },
            data: { status: "FAILED", error: safe },
          }),
          db.processingRun.update({
            where: { id: run.id },
            data: { status: "FAILED", error: safe, completedAt: new Date() },
          }),
        ]);
      } finally {
        if (operation) endLessonOperation(id, operation);
      }
    });
    scheduled = true;
    return NextResponse.json(
      { status: "EXTRACTING", runId: run.id },
      { status: 202 },
    );
  } catch (error) {
    if (operation && operationLessonId && !scheduled)
      endLessonOperation(operationLessonId, operation);
    return errorResponse(error);
  }
}
