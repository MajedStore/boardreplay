import { z } from "zod";
import { db } from "@/lib/db";
import { api, ApiError, sameOrigin, limit } from "@/lib/api";
import { comparisonInclude, serializeComparison } from "@/lib/lessons";
import { providerIdSchema } from "@/lib/validation/schemas";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    sameOrigin(request);
    limit("manual-result", 40);
    const { id } = await params;
    const body = z
      .object({
        provider: providerIdSchema,
        model: z.string().max(150).default("Unknown (manual)"),
        rawOutput: z.string().trim().min(1).max(200000),
        notes: z.string().max(6000).default(""),
      })
      .parse(await request.json());
    if (!(await db.comparisonRun.findUnique({ where: { id } })))
      throw new ApiError("Comparison not found.", 404);
    await db.$transaction(async (tx) => {
      await tx.providerResult.create({
        data: { comparisonId: id, ...body, mode: "MANUAL", scores: {} },
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
  });
}
