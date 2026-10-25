import { z } from "zod";
export const evidenceSchema = z.enum([
  "OBSERVED",
  "DERIVED",
  "UNCERTAIN",
  "USER_EDITED",
]);
export const contentTypeSchema = z.enum([
  "heading",
  "paragraph",
  "equation",
  "derivation",
  "list",
  "code",
  "table",
  "diagram",
  "algorithm",
  "uml",
  "circuit",
  "flowchart",
  "graph",
  "chemical",
  "drawing",
  "annotation",
  "shape",
  "arrow",
  "image_crop",
  "other",
]);
export const boardRectSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
});
export const sourceRegionSchema = boardRectSchema.extend({
  imageId: z.string().min(1),
  rotation: z
    .union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
    .optional(),
  imageAspectRatio: z.number().positive().max(1000).optional(),
});
export const visualSchema = z.object({
  shape: z.enum(["rectangle", "ellipse", "diamond", "line", "arrow"]),
  fromId: z.string().nullable(),
  toId: z.string().nullable(),
  points: z
    .array(
      z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
    )
    .max(100),
  label: z.string().max(2000),
});
export const boardElementSchema = z.object({
  id: z.string().min(1).max(120),
  type: contentTypeSchema,
  text: z.string().max(30000),
  latex: z.string().max(30000).nullable().optional(),
  codeLanguage: z.string().max(60).nullable().optional(),
  semanticLabel: z.string().max(150).nullable().optional(),
  layout: boardRectSchema,
  layoutBasis: z.enum([
    "SOURCE_ESTIMATED",
    "AUTO_LAYOUT",
    "USER_SET",
    "SAMPLE_EXACT",
  ]),
  sourceImageIds: z.array(z.string().min(1)).max(20),
  sourceRegion: sourceRegionSchema.nullable().optional(),
  sourceView: sourceRegionSchema.omit({ x: true, y: true, width: true, height: true }).optional(),
  evidenceStatus: evidenceSchema,
  uncertainty: z.string().max(4000).nullable().optional(),
  visual: visualSchema.nullable().optional(),
});
export const boardChangeSchema = z.object({
  id: z.string().min(1).max(120),
  action: z.enum([
    "ADD",
    "UNCHANGED",
    "MODIFY",
    "ERASE",
    "CORRECT",
    "NEW_TOPIC",
  ]),
  targetId: z.string().min(1).max(120).nullable(),
  element: boardElementSchema.nullable(),
  description: z.string().max(4000),
});
export const stepSchema = z.object({
  id: z.string().min(1).max(120),
  type: contentTypeSchema,
  sectionId: z.string().min(1).max(120),
  text: z.string().max(30000),
  latex: z.string().max(30000).nullable().optional(),
  stepIndex: z.number().int().min(0),
  sourceImageIds: z.array(z.string().min(1)).max(20),
  evidenceStatus: evidenceSchema,
  uncertainty: z.string().max(4000).nullable().optional(),
  originalText: z.string().max(30000).nullable().optional(),
  explanation: z.boolean().optional(),
  verification: z
    .object({
      status: z.enum(["VERIFIED", "SUSPICIOUS", "NOT_VERIFIED"]),
      message: z.string().max(2000),
    })
    .nullable()
    .optional(),
  changes: z.array(boardChangeSchema).max(100).optional(),
  sequenceId: z.string().min(1).max(120).optional(),
  organizationStateId: z.string().min(1).max(120).optional(),
});
const orderingConfidenceSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);
export const photoOrganizationSchema = z.object({
  version: z.literal(1),
  mode: z.enum(["AUTOMATIC", "MANUAL"]),
  sequences: z.array(z.object({
    id: z.string().min(1).max(120), title: z.string().max(300),
    orderingConfidence: orderingConfidenceSchema,
    uncertainty: z.string().max(4000).nullable(),
    states: z.array(z.object({
      id: z.string().min(1).max(120), imageIds: z.array(z.string().min(1)).min(1).max(20),
      primaryImageId: z.string().min(1), reason: z.string().max(4000), confidence: orderingConfidenceSchema,
    })).min(1).max(20),
  })).min(1).max(20),
  duplicateGroups: z.array(z.object({
    imageIds: z.array(z.string().min(1)).min(2).max(20), primaryImageId: z.string().min(1),
    kind: z.enum(["EXACT", "SAME_STATE", "POSSIBLE"]), reason: z.string().max(4000),
  })).max(40),
  relationships: z.array(z.object({
    fromImageId: z.string().min(1), toImageId: z.string().min(1),
    kind: z.enum(["BEFORE", "SAME_STATE", "OVERLAP", "UNRELATED", "UNCERTAIN"]),
    confidence: orderingConfidenceSchema, reason: z.string().max(4000),
  })).max(380),
  warnings: z.array(z.string().max(4000)).max(100),
});
export const reconstructionSchema = z.object({
  schemaVersion: z.literal(2).optional(),
  disciplines: z.array(z.string().max(150)).max(30).optional(),
  board: z.object({ aspectRatio: z.number().min(0.5).max(4) }).optional(),
  title: z.string().min(1).max(300),
  overview: z.string().max(10000),
  concepts: z.array(z.string().max(1000)).max(100),
  sections: z
    .array(
      z.object({
        id: z.string().min(1).max(120),
        title: z.string().min(1).max(300),
      }),
    )
    .min(1)
    .max(100),
  steps: z.array(stepSchema).min(1).max(300),
  unresolved: z.array(z.string().max(4000)).max(100),
  organization: photoOrganizationSchema.optional(),
});
export const lessonInputSchema = z.object({
  title: z.string().trim().min(1, "Give your lesson a name.").max(180),
  course: z.string().trim().max(180).default(""),
  topic: z.string().trim().max(300).default(""),
  date: z
    .string()
    .regex(/^$|^\d{4}-\d{2}-\d{2}$/)
    .default(""),
  language: z.string().max(60).default("Original language"),
  instructions: z.string().max(4000).default(""),
});
export const providerIdSchema = z.enum(["openai", "gemini", "anthropic"]);
