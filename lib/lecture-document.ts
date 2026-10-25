import { z } from "zod";
import type { LectureDocument } from "./types";
import { photoOrganizationSchema } from "./validation/schemas";

export const photoExplanationSchema = z.object({
  id: z.string().min(1).max(160), imageId: z.string().min(1), sequenceId: z.string().min(1),
  heading: z.string().max(300), bodyMarkdown: z.string().min(1).max(30000),
  relation: z.enum(["INITIAL", "CONTINUATION", "CORRECTION", "REPEAT", "COMPLEMENTARY", "INDEPENDENT"]),
  evidenceStatus: z.enum(["DERIVED", "UNCERTAIN", "USER_EDITED"]), uncertainty: z.string().max(4000).nullable(),
  sourceImageIds: z.array(z.string().min(1)).min(1).max(20),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]), imageAspectRatio: z.number().positive().max(1000),
});
export const lectureDocumentSchema = z.object({
  schemaVersion: z.literal(1), title: z.string().min(1).max(300), overview: z.string().max(10000), language: z.string().max(100),
  organization: photoOrganizationSchema, photos: z.array(photoExplanationSchema).min(1).max(20), unresolved: z.array(z.string().max(4000)).max(200),
});
export function validateLectureDocument(value: unknown, imageIds: readonly string[]): LectureDocument {
  const document = lectureDocumentSchema.parse(value);
  const photos = document.photos.map((photo) => photo.imageId);
  if (photos.length !== imageIds.length || new Set(photos).size !== imageIds.length || imageIds.some((id) => !photos.includes(id))) throw new Error("Every uploaded photograph must appear exactly once in the lecture document.");
  if (new Set(document.photos.map((photo) => photo.id)).size !== photos.length) throw new Error("Photo explanation IDs must be unique.");
  for (const photo of document.photos) {
    if (!photo.sourceImageIds.includes(photo.imageId) || photo.sourceImageIds.some((id) => !imageIds.includes(id))) throw new Error("Each explanation must cite its own photograph and only verified lesson sources.");
    if (photo.evidenceStatus === "UNCERTAIN" && !photo.uncertainty?.trim()) throw new Error("An uncertain explanation must identify what needs review.");
  }
  return document;
}
