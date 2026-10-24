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
  | "diagram";
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
}
export interface LessonSection {
  id: string;
  title: string;
}
export interface Reconstruction {
  title: string;
  overview: string;
  concepts: string[];
  sections: LessonSection[];
  steps: ReconstructionStep[];
  unresolved: string[];
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
export interface ProcessingRun {
  id: string;
  status: string;
  provider: string;
  model: string;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
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
  images: LectureImage[];
  reconstruction: Reconstruction | null;
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
