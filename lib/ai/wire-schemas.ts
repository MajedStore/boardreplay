import { z } from "zod";

export const contentTypeSchema = z.enum([
  "heading",
  "paragraph",
  "equation",
  "derivation",
  "list",
  "code",
  "table",
  "diagram",
]);

// Required nullable fields keep this wire format compatible with strict structured outputs.
export const extractionSchema = z
  .object({
    language: z.string(),
    items: z.array(
      z
        .object({
          id: z.string(),
          type: contentTypeSchema,
          text: z.string(),
          latex: z.string().nullable(),
          spatialRelationships: z.array(z.string()),
          uncertainty: z.string().nullable(),
        })
        .strict(),
    ),
    unreadableRegions: z.array(z.string()),
    boardOverview: z.string(),
  })
  .strict();

export type ImageExtraction = z.infer<typeof extractionSchema> & {
  imageId: string;
  sequence: number;
};

export const aiReconstructionSchema = z
  .object({
    title: z.string(),
    overview: z.string(),
    concepts: z.array(z.string()),
    sections: z.array(z.object({ id: z.string(), title: z.string() }).strict()),
    steps: z.array(
      z
        .object({
          id: z.string(),
          type: contentTypeSchema,
          sectionId: z.string(),
          text: z.string(),
          latex: z.string().nullable(),
          stepIndex: z.number().int(),
          sourceImageIds: z.array(z.string()),
          evidenceStatus: z.enum(["OBSERVED", "DERIVED", "UNCERTAIN"]),
          uncertainty: z.string().nullable(),
          originalText: z.string().nullable(),
          explanation: z.boolean(),
        })
        .strict(),
    ),
    unresolved: z.array(z.string()),
  })
  .strict();
