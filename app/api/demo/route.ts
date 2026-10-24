import { promises as fs } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { api, sameOrigin, limit } from "@/lib/api";
import { json } from "@/lib/lessons";
import { sampleReconstruction } from "@/lib/demo";
import { storeImage, removeStoredImage } from "@/lib/storage/images";
import type { Prisma } from "@/generated/prisma/client";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return api(async () => {
    sameOrigin(request);
    limit("demo", 20);
    const existing = await db.lesson.findFirst({
      where: { isDemo: true, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
    });
    if (existing && new URL(request.url).searchParams.get("fresh") !== "true")
      return { id: existing.id };
    const stored: string[] = [];
    try {
      const files: Prisma.LectureImageCreateWithoutLessonInput[] = [];
      for (let index = 1; index <= 4; index++) {
        const buffer = await fs.readFile(
          path.resolve(`public/demo/frame-${index}.png`),
        );
        const info = await storeImage(buffer, "image/png");
        stored.push(info.storagePath);
        files.push({
          ...info,
          originalFilename: `sample-board-${index}.png`,
          sequence: index - 1,
          mimeType: "image/png",
        });
      }
      const lesson = await db.$transaction(async (tx) => {
        const row = await tx.lesson.create({
          data: {
            title: "Completing the square",
            course: "Mathematics · Synthetic sample",
            topic: "Quadratic equations",
            language: "English",
            status: "COMPLETED",
            isDemo: true,
            images: { create: files },
          },
          include: { images: { orderBy: { sequence: "asc" } } },
        });
        await tx.lesson.update({
          where: { id: row.id },
          data: {
            reconstruction: json(
              sampleReconstruction(row.images.map((i) => i.id)),
            ),
          },
        });
        return row;
      });
      return { id: lesson.id };
    } catch (error) {
      await Promise.all(stored.map(removeStoredImage));
      throw error;
    }
  });
}
