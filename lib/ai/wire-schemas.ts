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

const coordinate = z.number().min(0).max(1);
const boundsSchema = z
  .object({
    x: coordinate,
    y: coordinate,
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .strict();
const visualSchema = z
  .object({
    shape: z.enum(["rectangle", "ellipse", "diamond", "line", "arrow"]),
    fromId: z.string().nullable(),
    toId: z.string().nullable(),
    points: z.array(z.object({ x: coordinate, y: coordinate }).strict()),
    label: z.string(),
  })
  .strict();
const observedEvidenceSchema = z.enum(["OBSERVED", "DERIVED", "UNCERTAIN"]);

// Required nullable fields keep the wire format compatible with strict APIs.
export const extractionSchema = z
  .object({
    language: z.string(),
    boardState: z.enum(["CONTENT", "BLANK", "UNREADABLE"]),
    disciplines: z.array(z.string()),
    boardAspectRatio: z.number().min(0.5).max(4).nullable(),
    items: z.array(
      z
        .object({
          id: z.string(),
          type: contentTypeSchema,
          semanticLabel: z.string().nullable(),
          text: z.string(),
          latex: z.string().nullable(),
          codeLanguage: z.string().nullable(),
          // An evidence signature aids comparison; it does not prove object identity.
          linkingKey: z.string(),
          sourceRegion: boundsSchema.nullable(),
          mark: z.enum(["VISIBLE", "CROSSED_OUT", "PARTLY_ERASED"]),
          spatialRelationships: z.array(
            z
              .object({
                relation: z.enum([
                  "LEFT_OF",
                  "RIGHT_OF",
                  "ABOVE",
                  "BELOW",
                  "CONTAINS",
                  "CONNECTS_TO",
                  "POINTS_TO",
                  "ALIGNED_WITH",
                ]),
                targetId: z.string(),
                uncertainty: z.string().nullable(),
              })
              .strict(),
          ),
          visual: visualSchema.nullable(),
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
  visualAssessment?: z.infer<typeof visualAssessmentSchema>;
};

export const visualAssessmentSchema = z.object({
  boardBounds: boundsSchema.nullable(),
  readableFraction: coordinate.nullable(),
  visibleBoardFraction: coordinate.nullable(),
  qualityNotes: z.array(z.string()).max(12),
  occlusions: z.array(z.object({
    kind: z.enum(["PERSON", "OBJECT", "GLARE", "BLUR", "OUT_OF_FRAME"]),
    region: boundsSchema.nullable(),
    description: z.string(),
  }).strict()).max(20),
}).strict();

/** New visual analysis adds calibrated uncertainty; old persisted observations remain readable. */
export const photoObservationSchema = extractionSchema.extend({ visualAssessment: visualAssessmentSchema }).strict();

/** One explanation per original photograph; academic text has no spatial coordinates. */
export const photoExplanationsSchema = z.object({
  language: z.string().min(1).max(80),
  photos: z.array(z.object({
    imageId: z.string().min(1),
    heading: z.string().max(220),
    bodyMarkdown: z.string().min(1).max(18000),
    relation: z.enum(["INITIAL", "CONTINUATION", "CORRECTION", "REPEAT", "COMPLEMENTARY", "INDEPENDENT"]),
    evidenceStatus: z.enum(["DERIVED", "UNCERTAIN"]),
    uncertainty: z.string().max(3000).nullable(),
    sourceImageIds: z.array(z.string().min(1)).min(1).max(20),
  }).strict()).min(1).max(4),
  warnings: z.array(z.string().max(2000)).max(20),
}).strict();

const confidenceSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);
export const photoOrganizationSchema = z.object({
  version: z.literal(1),
  mode: z.enum(["AUTOMATIC", "MANUAL"]),
  sequences: z.array(z.object({
    id: z.string(), title: z.string(), orderingConfidence: confidenceSchema,
    uncertainty: z.string().nullable(),
    states: z.array(z.object({
      id: z.string(), imageIds: z.array(z.string()).min(1).max(20), primaryImageId: z.string(),
      reason: z.string(), confidence: confidenceSchema,
    }).strict()).min(1).max(20),
  }).strict()).min(1).max(20),
  duplicateGroups: z.array(z.object({
    imageIds: z.array(z.string()).min(2).max(20), primaryImageId: z.string(),
    kind: z.enum(["EXACT", "SAME_STATE", "POSSIBLE"]), reason: z.string(),
  }).strict()).max(20),
  relationships: z.array(z.object({
    fromImageId: z.string(), toImageId: z.string(),
    kind: z.enum(["BEFORE", "SAME_STATE", "OVERLAP", "UNRELATED", "UNCERTAIN"]),
    confidence: confidenceSchema, reason: z.string(),
  }).strict()).max(60),
  warnings: z.array(z.string()).max(30),
}).strict();

export const aiBoardElementSchema = z
  .object({
    id: z.string(),
    type: contentTypeSchema,
    semanticLabel: z.string().nullable(),
    text: z.string(),
    latex: z.string().nullable(),
    codeLanguage: z.string().nullable(),
    layout: boundsSchema,
    layoutBasis: z.enum(["SOURCE_ESTIMATED", "AUTO_LAYOUT"]),
    sourceImageIds: z.array(z.string()),
    sourceRegion: z
      .object({ imageId: z.string(), ...boundsSchema.shape })
      .strict()
      .nullable(),
    evidenceStatus: observedEvidenceSchema,
    uncertainty: z.string().nullable(),
    visual: visualSchema.nullable(),
  })
  .strict();

export const aiReconstructionSchema = z
  .object({
    schemaVersion: z.literal(2),
    title: z.string(),
    overview: z.string(),
    disciplines: z.array(z.string()),
    board: z.object({ aspectRatio: z.number().min(0.5).max(4) }).strict(),
    concepts: z.array(z.string()),
    sections: z.array(z.object({ id: z.string(), title: z.string() }).strict()),
    steps: z
      .array(
        z
          .object({
            id: z.string(),
            type: contentTypeSchema,
            sectionId: z.string(),
            text: z.string(),
            latex: z.string().nullable(),
            stepIndex: z.number().int().min(0),
            sourceImageIds: z.array(z.string()),
            evidenceStatus: observedEvidenceSchema,
            uncertainty: z.string().nullable(),
            originalText: z.string().nullable(),
            explanation: z.boolean(),
            changes: z.array(
              z
                .object({
                  id: z.string(),
                  action: z.enum([
                    "ADD",
                    "UNCHANGED",
                    "MODIFY",
                    "ERASE",
                    "CORRECT",
                    "NEW_TOPIC",
                  ]),
                  targetId: z.string().nullable(),
                  element: aiBoardElementSchema.nullable(),
                  description: z.string(),
                })
                .strict(),
            ),
          })
          .strict(),
      )
      .min(1),
    unresolved: z.array(z.string()),
  })
  .strict();
