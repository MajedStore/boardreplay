import { z } from "zod";
import { db } from "@/lib/db";
import { api, ApiError, sameOrigin, limit } from "@/lib/api";
import {
  comparisonInclude,
  ensureEditable,
  json,
  serializeComparison,
} from "@/lib/lessons";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return api(async () => {
    const lessonId = new URL(request.url).searchParams.get("lessonId");
    if (!lessonId) throw new ApiError("Select a lesson.");
    return (
      await db.comparisonRun.findMany({
        where: { lessonId },
        include: comparisonInclude,
        orderBy: { createdAt: "desc" },
      })
    ).map(serializeComparison);
  });
}
export async function POST(request: Request) {
  return api(async () => {
    sameOrigin(request);
    limit("comparison-create", 30);
    const body = z
      .object({
        lessonId: z.string(),
        prompt: z.string().trim().min(10).max(12000),
      })
      .parse(await request.json());
    await ensureEditable(body.lessonId);
    const images = await db.lectureImage.findMany({
      where: { lessonId: body.lessonId },
      orderBy: { sequence: "asc" },
    });
    if (!images.length)
      throw new ApiError(
        "Upload images or open the sample lesson before creating a comparison.",
      );
    const row = await db.comparisonRun.create({
      data: {
        lessonId: body.lessonId,
        prompt: body.prompt,
        imageSnapshot: json(
          images.map((i) => ({
            id: i.id,
            sequence: i.sequence,
            rotation: i.rotation,
          })),
        ),
      },
      include: comparisonInclude,
    });
    return serializeComparison(row);
  });
}
