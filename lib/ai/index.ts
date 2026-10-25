import "server-only";
import type { Lesson, PhotoOrganization, ProviderId, Reconstruction } from "../types";
import type { PhotoMetrics } from "../photos/metrics";
import { reconstructOrganized, type AnalysisCache } from "./organized-pipeline";


import type { AiProvider, VisionImage } from "./contracts";
import { getProviderConfiguration, getProviders } from "./config";
import { AiError, safeAiError, withBoundedRetry } from "./errors";
import { EVIDENCE_SYSTEM_PROMPT } from "./prompts";
import { OpenAiProvider } from "./providers/openai";
import { GeminiProvider } from "./providers/gemini";
import { AnthropicProvider } from "./providers/anthropic";
import type { ImageExtraction } from "./wire-schemas";
import { explainPhotoLecture, type PhotoLectureResult } from "./photo-document";

export { getProviders } from "./config";
export { AiError, safeAiError } from "./errors";
export { extractionSchema, aiReconstructionSchema } from "./wire-schemas";
export type { VisionImage } from "./contracts";
export type { PhotoLectureResult } from "./photo-document";

export function createProvider(id: ProviderId): AiProvider {
  const { apiKey, model } = getProviderConfiguration(id);
  if (id === "openai") return new OpenAiProvider(apiKey, model);
  if (id === "gemini") return new GeminiProvider(apiKey, model);
  return new AnthropicProvider(apiKey, model);
}

function orderedImages(images: VisionImage[]): VisionImage[] {
  if (!images.length)
    throw new AiError(
      "INVALID_INPUT",
      "Upload at least one board photograph before processing.",
    );
  if (images.length > 20)
    throw new AiError(
      "INVALID_INPUT",
      "Process at most 20 photographs per lesson.",
    );
  const ids = new Set<string>();
  const sequences = new Set<number>();
  for (const image of images) {
    if (
      !image.id ||
      ids.has(image.id) ||
      sequences.has(image.sequence) ||
      !Number.isInteger(image.sequence) ||
      image.sequence < 0 ||
      !["image/jpeg", "image/png", "image/webp"].includes(image.mimeType) ||
      !image.base64
    ) {
      throw new AiError(
        "INVALID_INPUT",
        "The image set is invalid. Review the uploaded photographs and try again.",
      );
    }
    ids.add(image.id);
    sequences.add(image.sequence);
  }
  return [...images].sort((left, right) => left.sequence - right.sequence);
}

/** Reject malformed observation geometry and invented local diagram links. */
function validateObservation(observation: ImageExtraction): void {
  const ids = new Set(observation.items.map((item) => item.id));
  if (ids.size !== observation.items.length || ids.has(""))
    throw new AiError(
      "INVALID_OUTPUT",
      "Photograph observations must have unique non-empty item IDs.",
    );
  for (const item of observation.items) {
    if (
      item.spatialRelationships.some(
        (relation) => !ids.has(relation.targetId),
      ) ||
      (item.visual?.fromId != null && !ids.has(item.visual.fromId)) ||
      (item.visual?.toId != null && !ids.has(item.visual.toId))
    )
      throw new AiError(
        "INVALID_OUTPUT",
        "An observed diagram connection references an unseen item.",
      );
  }
}

export interface ReconstructionRequest {
  lesson: Pick<
    Lesson,
    "title" | "course" | "topic" | "language" | "instructions"
  >;
  images: VisionImage[];
  provider?: ProviderId;
  organizationMode?: "AUTOMATIC" | "MANUAL";
  photoMetrics?: PhotoMetrics[];
  cache?: AnalysisCache;
  onOrganization?: (organization: PhotoOrganization) => void | Promise<void>;
  onExtraction?: (observation: ImageExtraction) => void | Promise<void>;
  onStage?: (stage: "ANALYZING" | "EXTRACTING" | "FINDING_DUPLICATES" | "ORGANIZING" | "RECONSTRUCTING") => void | Promise<void>;
}

export interface ReconstructionResult {
  reconstruction: Reconstruction;
  extractions: ImageExtraction[];
  organization: PhotoOrganization;
  provider: string;
  model: string;
}

export async function reconstructLesson(
  request: ReconstructionRequest,
): Promise<ReconstructionResult> {
  const selected =
    request.provider ||
    getProviders().find((provider) => provider.configured)?.id;
  if (!selected)
    throw new AiError(
      "MISSING_CONFIGURATION",
      "No AI provider is configured. Add a server API key in .env, or open the clearly labeled sample lesson to explore replay.",
    );
  return reconstructWithProvider(request, createProvider(selected));
}

/** Dependency injection keeps automatic tests deterministic and prevents API costs. */
export async function reconstructWithProvider(
  request: ReconstructionRequest,
  provider: AiProvider,
): Promise<ReconstructionResult> {
  return reconstructOrganized({ ...request, images: orderedImages(request.images) }, provider, validateObservation);
}

export async function explainLesson(request: ReconstructionRequest): Promise<PhotoLectureResult> {
  const selected = request.provider || getProviders().find((provider) => provider.configured)?.id;
  if (!selected) throw new AiError("MISSING_CONFIGURATION", "Connect an AI provider to organize your photographs and write lecture explanations.");
  return explainWithProvider(request, createProvider(selected));
}

/** Injectable provider keeps the photographic document pipeline repeatable without network calls. */
export async function explainWithProvider(request: ReconstructionRequest, provider: AiProvider): Promise<PhotoLectureResult> {
  return explainPhotoLecture({ ...request, images: orderedImages(request.images) }, provider, validateObservation);
}

export async function benchmark(
  providerId: ProviderId,
  inputImages: VisionImage[],
  prompt: string,
  systemInstructions = EVIDENCE_SYSTEM_PROMPT,
): Promise<{
  rawOutput: string;
  structuredOutput?: unknown;
  model: string;
  durationMs: number;
}> {
  const images = orderedImages(inputImages);
  if (!prompt.trim() || prompt.length > 20_000)
    throw new AiError(
      "INVALID_INPUT",
      "Provide a common evaluation prompt of at most 20,000 characters.",
    );
  const provider = createProvider(providerId);
  const start = performance.now();
  try {
    const result = await withBoundedRetry(() =>
      provider.generate({ system: systemInstructions, prompt, images }),
    );
    return { ...result, durationMs: Math.round(performance.now() - start) };
  } catch (error) {
    throw safeAiError(error);
  }
}
