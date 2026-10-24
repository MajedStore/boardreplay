import { z } from "zod";
import { db } from "@/lib/db";
import { api, ApiError, sameOrigin } from "@/lib/api";
import { comparisonInclude, serializeComparison } from "@/lib/lessons";
export const runtime = "nodejs";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    sameOrigin(request);
    const { id } = await params;
    const data = z
      .object({ reference: z.string().max(100000) })
      .parse(await request.json());
    if (!(await db.comparisonRun.findUnique({ where: { id } })))
      throw new ApiError("Comparison not found.", 404);
    return serializeComparison(
      await db.comparisonRun.update({
        where: { id },
        data,
        include: comparisonInclude,
      }),
    );
  });
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    sameOrigin(request);
    const { id } = await params;
    await db.comparisonRun.deleteMany({ where: { id } });
    return { deleted: true };
  });
}
