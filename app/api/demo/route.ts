import { promises as fs } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { api, sameOrigin, limit } from "@/lib/api";
import { json } from "@/lib/lessons";
import { LINKED_LIST_DEMO_TOPIC, sampleReconstruction } from "@/lib/demo";
import {
  disciplineExamples,
  disciplineReconstruction,
  type DisciplineExample,
} from "@/lib/demo-examples";
import { storeImage, removeStoredImage } from "@/lib/storage/images";
import type { Prisma } from "@/generated/prisma/client";
import { sampleLectureDocument } from "@/lib/demo-document";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return api(async () => {
    sameOrigin(request);
    limit("demo", 20);
    const requestedExample = new URL(request.url).searchParams.get("example");
    const example =
      requestedExample && Object.hasOwn(disciplineExamples, requestedExample)
        ? (requestedExample as DisciplineExample)
        : null;
    const topic = example ? `${example}-evolution-v2` : LINKED_LIST_DEMO_TOPIC;
    const existing = await db.lesson.findFirst({
      where: { isDemo: true, status: "COMPLETED", topic },
      orderBy: { createdAt: "desc" },
    });
    if (
      existing &&
      typeof existing.reconstruction === "object" &&
      existing.reconstruction !== null &&
      !Array.isArray(existing.reconstruction) &&
      existing.reconstruction.schemaVersion === 2 && existing.document &&
      new URL(request.url).searchParams.get("fresh") !== "true"
    )
      return { id: existing.id };
    const stored: string[] = [];
    try {
      const files: Prisma.LectureImageCreateWithoutLessonInput[] = [];
      for (let index = 1; index <= (example ? 2 : 5); index++) {
        const buffer = await fs.readFile(
          path.resolve(`public/demo/${example || "frame"}-${index}.png`),
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
            title: example
              ? disciplineExamples[example].title
              : "Linked lists: preserve the pointer, then insert",
            course: `${example ? disciplineExamples[example].course : "Data Structures and Algorithms"} · Synthetic sample`,
            topic,
            language: "English",
            status: "COMPLETED",
            isDemo: true,
            images: { create: files },
          },
          include: { images: { orderBy: { sequence: "asc" } } },
        });
        const reconstruction = example ? disciplineReconstruction(example, row.images.map((image) => image.id)) : sampleReconstruction(row.images.map((image) => image.id));
        await tx.lesson.update({
          where: { id: row.id },
          data: {
            document: json(sampleLectureDocument(reconstruction, row.images)),
            reconstruction: json(
              example
                ? disciplineReconstruction(
                    example,
                    row.images.map((i) => i.id),
                  )
                : sampleReconstruction(row.images.map((i) => i.id)),
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
