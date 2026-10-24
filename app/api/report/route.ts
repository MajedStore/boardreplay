import { z } from "zod";
import { db } from "@/lib/db";
import { api, ApiError, sameOrigin } from "@/lib/api";
import { json } from "@/lib/lessons";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({
  problem: z.string().max(12000),
  objective: z.string().max(12000),
  methodology: z.string().max(12000),
  implementation: z.string().max(12000),
  limitations: z.string().max(12000),
  conclusion: z.string().max(12000),
});
function lessonId(request: Request) {
  const id = new URL(request.url).searchParams.get("lessonId");
  if (!id) throw new ApiError("Select a lesson.");
  return id;
}
export async function GET(request: Request) {
  return api(async () => {
    const id = lessonId(request);
    const report = await db.reportDraft.findUnique({ where: { lessonId: id } });
    return (
      report?.content ?? {
        problem: "",
        objective: "",
        methodology: "",
        implementation: "",
        limitations: "",
        conclusion: "",
      }
    );
  });
}
export async function PUT(request: Request) {
  return api(async () => {
    sameOrigin(request);
    const id = lessonId(request);
    const content = schema.parse(await request.json());
    if (!(await db.lesson.findUnique({ where: { id } })))
      throw new ApiError("Lesson not found.", 404);
    await db.reportDraft.upsert({
      where: { lessonId: id },
      create: { lessonId: id, content: json(content) },
      update: { content: json(content) },
    });
    return content;
  });
}
