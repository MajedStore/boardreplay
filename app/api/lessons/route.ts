import { db } from "@/lib/db";
import { api, sameOrigin, limit } from "@/lib/api";
import { lessonInputSchema } from "@/lib/validation/schemas";
import { lessonInclude, serializeLesson } from "@/lib/lessons";
import { recoverInterruptedOperations } from "@/lib/operations";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(async () => {
    await recoverInterruptedOperations();
    return (
      await db.lesson.findMany({
        include: lessonInclude,
        orderBy: { updatedAt: "desc" },
      })
    ).map(serializeLesson);
  });
}
export async function POST(request: Request) {
  return api(async () => {
    sameOrigin(request);
    limit("create", 30);
    const data = lessonInputSchema.parse(await request.json());
    return serializeLesson(
      await db.lesson.create({ data, include: lessonInclude }),
    );
  });
}
