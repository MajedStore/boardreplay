import { db } from "@/lib/db";
import { ApiError, errorResponse } from "@/lib/api";
import { imageForAI } from "@/lib/storage/images";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const rotation = Number(
      new URL(request.url).searchParams.get("rotation") ?? 0,
    );
    if (![0, 90, 180, 270].includes(rotation))
      throw new ApiError("Unsupported image rotation.");
    const image = await db.lectureImage.findUnique({ where: { id } });
    if (!image) throw new ApiError("Image not found.", 404);
    const prepared = await imageForAI({ ...image, rotation });
    const bytes = Buffer.from(prepared.base64, "base64");
    return new Response(bytes, {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
