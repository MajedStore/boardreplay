import { z } from "zod";
import { db } from "@/lib/db";
import { api, ApiError, sameOrigin } from "@/lib/api";
import { json } from "@/lib/lessons";
import { EVALUATION_CATEGORIES } from "@/lib/types";
export const runtime = "nodejs";
const scoreShape = Object.fromEntries(
  EVALUATION_CATEGORIES.map((key) => [
    key,
    z.number().int().min(0).max(5).optional(),
  ]),
);
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    sameOrigin(request);
    const { id } = await params;
    const body = z
      .object({
        notes: z.string().max(6000).optional(),
        scores: z.object(scoreShape).strict().optional(),
      })
      .parse(await request.json());
    if (!(await db.providerResult.findUnique({ where: { id } })))
      throw new ApiError("Result not found.", 404);
    const result = await db.providerResult.update({
      where: { id },
      data: { ...body, ...(body.scores ? { scores: json(body.scores) } : {}) },
    });
    return { ...result, createdAt: result.createdAt.toISOString() };
  });
}
