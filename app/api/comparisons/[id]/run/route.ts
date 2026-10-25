import { z } from "zod";
import { db } from "@/lib/db";
import { api, ApiError, sameOrigin, limit } from "@/lib/api";
import { comparisonInclude, json, serializeComparison } from "@/lib/lessons";
import { providerIdSchema } from "@/lib/validation/schemas";
import { imageForAI } from "@/lib/storage/images";
import { benchmark, getProviders } from "@/lib/ai";
import type { ComparisonRun } from "@/lib/types";
import {
  beginLessonOperation,
  endLessonOperation,
  recoverInterruptedOperation,
} from "@/lib/operations";
export const runtime = "nodejs";
export const maxDuration = 300;
const active = new Set<string>();
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    sameOrigin(request);
    limit("benchmark", 9);
    const { id } = await params;
    const { provider } = z
      .object({ provider: providerIdSchema })
      .parse(await request.json());
    if (!getProviders().find((p) => p.id === provider)?.configured)
      throw new ApiError(
        "Configure this provider API key on the server first.",
      );
    const comparison = await db.comparisonRun.findUnique({
      where: { id },
      include: comparisonInclude,
    });
    if (!comparison) throw new ApiError("Comparison not found.", 404);
    if (!comparison.systemInstructions)
      throw new ApiError(
        "This historical benchmark did not save its system instructions. Create a new benchmark; existing responses and scores are preserved.",
      );
    const lock = `${id}:${provider}`;
    if (active.has(lock))
      throw new ApiError(
        "This provider is already running for this comparison.",
        409,
      );
    await recoverInterruptedOperation(comparison.lessonId);
    const operation = beginLessonOperation(comparison.lessonId, "benchmark");
    active.add(lock);
    try {
      const snapshot =
        comparison.imageSnapshot as unknown as ComparisonRun["imageSnapshot"];
      const images = [];
      for (const original of snapshot) {
        const image = await db.lectureImage.findFirst({
          where: { id: original.id, lessonId: comparison.lessonId },
        });
        if (!image)
          throw new ApiError(
            "An original benchmark image is missing. Create a new comparison.",
          );
        images.push(
          await imageForAI({
            ...image,
            rotation: original.rotation,
            sequence: original.sequence,
          }),
        );
      }
      const result = await benchmark(
        provider,
        images,
        comparison.prompt,
        comparison.systemInstructions,
      );
      await db.$transaction(async (tx) => {
        await tx.providerResult.create({
          data: {
            comparisonId: id,
            provider,
            model: result.model,
            rawOutput: result.rawOutput,
            mode: "AUTOMATIC",
            durationMs: Math.round(result.durationMs),
            scores: {},
            ...(result.structuredOutput
              ? { structuredOutput: json(result.structuredOutput) }
              : {}),
          },
        });
        await tx.comparisonRun.update({
          where: { id },
          data: { updatedAt: new Date() },
        });
      });
      return serializeComparison(
        await db.comparisonRun.findUniqueOrThrow({
          where: { id },
          include: comparisonInclude,
        }),
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AiError")
        throw new ApiError(error.message, 502);
      throw error;
    } finally {
      active.delete(lock);
      endLessonOperation(comparison.lessonId, operation);
    }
  });
}
