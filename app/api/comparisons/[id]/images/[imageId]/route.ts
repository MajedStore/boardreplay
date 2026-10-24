import { db } from "@/lib/db";
import { ApiError, errorResponse } from "@/lib/api";
import { imageForAI } from "@/lib/storage/images";
import type { ComparisonRun } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> },
) {
  try {
    const { id, imageId } = await params;
    const comparison = await db.comparisonRun.findUnique({ where: { id } });
    if (!comparison) throw new ApiError("Comparison not found.", 404);
    const snapshot = comparison.imageSnapshot as unknown as ComparisonRun["imageSnapshot"];
    const original = snapshot.find(image => image.id === imageId);
    if (!original) throw new ApiError("This image is not part of this benchmark.", 404);
    const image = await db.lectureImage.findFirst({
      where: { id: imageId, lessonId: comparison.lessonId },
    });
    if (!image) throw new ApiError("The benchmark source image is no longer available.", 404);
    const prepared = await imageForAI({ ...image, rotation: original.rotation, sequence: original.sequence });
    const bytes = Buffer.from(prepared.base64, "base64");
    const filename = `boardreplay-photo-${String(original.sequence + 1).padStart(2, "0")}.jpg`;
    return new Response(bytes, {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(bytes.length),
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
