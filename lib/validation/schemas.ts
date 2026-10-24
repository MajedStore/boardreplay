import { z } from "zod";
export const evidenceSchema = z.enum([
  "OBSERVED",
  "DERIVED",
  "UNCERTAIN",
  "USER_EDITED",
]);
export const stepSchema = z.object({
  id: z.string().min(1).max(120),
  type: z.enum([
    "heading",
    "paragraph",
    "equation",
    "derivation",
    "list",
    "code",
    "table",
    "diagram",
  ]),
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
});
export const reconstructionSchema = z.object({
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
