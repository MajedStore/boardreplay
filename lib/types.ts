export type ProviderId = "openai" | "gemini" | "anthropic";
export interface ProviderInfo {
  id: ProviderId;
  name: string;
  model: string;
  configured: boolean;
}
export type LessonStatus =
  | "PENDING"
  | "UPLOADING"
  | "READY"
  | "ANALYZING"
  | "FINDING_DUPLICATES"
  | "ORGANIZING"
  | "EXTRACTING"
  | "RECONSTRUCTING"
  | "COMPLETED"
  | "FAILED";
export type EvidenceStatus =
  "OBSERVED" | "DERIVED" | "UNCERTAIN" | "USER_EDITED";
export type ContentType =
  | "heading"
  | "paragraph"
  | "equation"
  | "derivation"
  | "list"
  | "code"
  | "table"
  | "diagram"
  | "algorithm"
  | "uml"
  | "circuit"
  | "flowchart"
  | "graph"
  | "chemical"
  | "drawing"
  | "annotation"
  | "shape"
  | "arrow"
  | "image_crop"
  | "other";
/** All coordinates are fractions of the board or the cited prepared photograph. */
export interface BoardRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface SourceRegion extends BoardRect {
  imageId: string;
  rotation?: number;
  imageAspectRatio?: number;
}
export interface BoardVisual {
  shape: "rectangle" | "ellipse" | "diamond" | "line" | "arrow";
  fromId: string | null;
  toId: string | null;
  points: { x: number; y: number }[];
  label: string;
}
export interface BoardElement {
  id: string;
  type: ContentType;
  text: string;
  latex?: string | null;
  codeLanguage?: string | null;
  semanticLabel?: string | null;
  layout: BoardRect;
  layoutBasis: "SOURCE_ESTIMATED" | "AUTO_LAYOUT" | "USER_SET" | "SAMPLE_EXACT";
  sourceImageIds: string[];
  sourceRegion?: SourceRegion | null;
  /** Complete prepared source orientation, independent of an optional localized region. */
  sourceView?: { imageId: string; rotation?: number; imageAspectRatio?: number };
  evidenceStatus: EvidenceStatus;
  uncertainty?: string | null;
  visual?: BoardVisual | null;
}
export type BoardAction =
  "ADD" | "UNCHANGED" | "MODIFY" | "ERASE" | "CORRECT" | "NEW_TOPIC";
export interface BoardChange {
  id: string;
  action: BoardAction;
  targetId: string | null;
  element: BoardElement | null;
  description: string;
}
export interface Verification {
  status: "VERIFIED" | "SUSPICIOUS" | "NOT_VERIFIED";
  message: string;
}
export interface ReconstructionStep {
  id: string;
  type: ContentType;
  sectionId: string;
  text: string;
  latex?: string | null;
  stepIndex: number;
  sourceImageIds: string[];
  evidenceStatus: EvidenceStatus;
  uncertainty?: string | null;
  originalText?: string | null;
  explanation?: boolean;
  verification?: Verification | null;
  /** Temporal board events. "steps" remains the storage/API name for compatibility. */
  changes?: BoardChange[];
  sequenceId?: string;
  organizationStateId?: string;
}
export type OrderingConfidence = "HIGH" | "MEDIUM" | "LOW";
export interface PhotoOrganization {
  version: 1;
  mode: "AUTOMATIC" | "MANUAL";
  sequences: {
    id: string;
    title: string;
    orderingConfidence: OrderingConfidence;
    uncertainty: string | null;
    states: {
      id: string;
      imageIds: string[];
      primaryImageId: string;
      reason: string;
      confidence: OrderingConfidence;
    }[];
  }[];
  duplicateGroups: {
    imageIds: string[];
    primaryImageId: string;
    kind: "EXACT" | "SAME_STATE" | "POSSIBLE";
    reason: string;
  }[];
  relationships: {
    fromImageId: string;
    toImageId: string;
    kind: "BEFORE" | "SAME_STATE" | "OVERLAP" | "UNRELATED" | "UNCERTAIN";
    confidence: OrderingConfidence;
    reason: string;
  }[];
  warnings: string[];
}
export interface LessonSection {
  id: string;
  title: string;
}
export interface Reconstruction {
  schemaVersion?: 2;
  disciplines?: string[];
  board?: { aspectRatio: number };
  title: string;
  overview: string;
  concepts: string[];
  sections: LessonSection[];
  steps: ReconstructionStep[];
  unresolved: string[];
  organization?: PhotoOrganization;
}
export interface LectureImage {
  id: string;
  lessonId: string;
  originalFilename: string;
  sequence: number;
  mimeType: string;
  width: number;
  height: number;
  rotation: number;
  uploadedAt: string;
  url: string;
}
export interface Revision {
  id: string;
  createdAt: string;
  reason: string;
}
export interface PhotoExplanation {
  id: string;
  imageId: string;
  sequenceId: string;
  heading: string;
  bodyMarkdown: string;
  relation: "INITIAL" | "CONTINUATION" | "CORRECTION" | "REPEAT" | "COMPLEMENTARY" | "INDEPENDENT";
  evidenceStatus: "DERIVED" | "UNCERTAIN" | "USER_EDITED";
  uncertainty: string | null;
  sourceImageIds: string[];
  rotation: number;
  imageAspectRatio: number;
}
export interface LectureDocument {
  schemaVersion: 1;
  title: string;
  overview: string;
  language: string;
  organization: PhotoOrganization;
  photos: PhotoExplanation[];
  unresolved: string[];
}
export interface ProcessingRun {
  id: string;
  status: string;
  provider: string;
  model: string;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
  organization?: PhotoOrganization | null;
}
export interface Lesson {
  id: string;
  title: string;
  course: string;
  topic: string;
  date: string;
  language: string;
  instructions: string;
  status: LessonStatus;
  error: string | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  needsReprocessing: boolean;
  organizationMode?: "AUTOMATIC" | "MANUAL";
  photoOrganization?: PhotoOrganization | null;
  images: LectureImage[];
  reconstruction: Reconstruction | null;
  document?: LectureDocument | null;
  explanationsNeedRefresh?: boolean;
  revisions: Revision[];
  runs: ProcessingRun[];
}
export const EVALUATION_CATEGORIES = [
  "textAccuracy",
  "equationAccuracy",
  "chronology",
  "erasedContent",
  "deduplication",
  "missingInformation",
  "hallucinationAvoidance",
  "readability",
] as const;
export type EvaluationCategory = (typeof EVALUATION_CATEGORIES)[number];
export type EvaluationScores = Partial<Record<EvaluationCategory, number>>;
export interface ProviderResult {
  id: string;
  provider: ProviderId;
  model: string;
  mode: "AUTOMATIC" | "MANUAL";
  rawOutput: string;
  structuredOutput?: unknown;
  durationMs: number | null;
  createdAt: string;
  notes: string;
  scores: EvaluationScores;
}
export interface ComparisonRun {
  id: string;
  lessonId: string;
  prompt: string;
  systemInstructions?: string;
  wrapperVersion?: string;
  imageIds: string[];
  imageSnapshot: { id: string; sequence: number; rotation: number }[];
  reference: string;
  results: ProviderResult[];
  createdAt: string;
  updatedAt: string;
}
export interface ReportDraft {
  problem: string;
  objective: string;
  methodology: string;
  implementation: string;
  limitations: string;
  conclusion: string;
}
