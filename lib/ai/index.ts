import "server-only";
import type { Lesson, ProviderId, Reconstruction } from "../types";
import { validateReconstruction } from "../reconstruction/validate";
import type { AiProvider, VisionImage } from "./contracts";
import { getProviderConfiguration, getProviders } from "./config";
import { AiError, safeAiError, withBoundedRetry } from "./errors";
import {
  EVIDENCE_SYSTEM_PROMPT,
  EXTRACTION_PROMPT,
  reconstructionPrompt,
} from "./prompts";
import { OpenAiProvider } from "./providers/openai";
import { GeminiProvider } from "./providers/gemini";
import { AnthropicProvider } from "./providers/anthropic";
import {
  aiReconstructionSchema,
  extractionSchema,
  type ImageExtraction,
} from "./wire-schemas";

export { getProviders } from "./config";
export { AiError, safeAiError } from "./errors";
export { extractionSchema, aiReconstructionSchema } from "./wire-schemas";
export type { VisionImage } from "./contracts";

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
  for (const image of images) {
    if (
      !image.id ||
      ids.has(image.id) ||
      !Number.isInteger(image.sequence) ||
      image.sequence < 0 ||
      !["image/jpeg", "image/png", "image/webp"].includes(image.mimeType) ||
      !image.base64
    ) {
      throw new AiError(
        "INVALID_INPUT",
        "The image set is invalid. Review your uploaded photographs and their order.",
      );
    }
    ids.add(image.id);
  }
  return [...images].sort((left, right) => left.sequence - right.sequence);
}

export interface ReconstructionRequest {
  lesson: Pick<
    Lesson,
    "title" | "course" | "topic" | "language" | "instructions"
  >;
  images: VisionImage[];
  provider?: ProviderId;
  onStage?: (stage: "EXTRACTING" | "RECONSTRUCTING") => void | Promise<void>;
}

export interface ReconstructionResult {
  reconstruction: Reconstruction;
  extractions: ImageExtraction[];
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
  const images = orderedImages(request.images);
  const extractions: ImageExtraction[] = [];
  await request.onStage?.("EXTRACTING");
  for (const image of images) {
    const response = await withBoundedRetry(() =>
      provider.generate({
        system: EVIDENCE_SYSTEM_PROMPT,
        prompt: EXTRACTION_PROMPT,
        images: [image],
        schema: extractionSchema,
        schemaName: "board_observation",
      }),
    );
    const parsed = extractionSchema.safeParse(response.structuredOutput);
    if (
      !parsed.success ||
      (!parsed.data.items.length && !parsed.data.unreadableRegions.length)
    )
      throw new AiError(
        "INVALID_OUTPUT",
        `No usable whiteboard observation was returned for photograph ${image.sequence + 1}. Review this photograph before retrying.`,
      );
    extractions.push({
      ...parsed.data,
      imageId: image.id,
      sequence: image.sequence,
    });
  }
  await request.onStage?.("RECONSTRUCTING");
  const response = await withBoundedRetry(() =>
    provider.generate({
      system: EVIDENCE_SYSTEM_PROMPT,
      prompt: reconstructionPrompt(request.lesson, extractions),
      images: [],
      schema: aiReconstructionSchema,
      schemaName: "reconstructed_lesson",
    }),
  );
  try {
    const structured = aiReconstructionSchema.parse(response.structuredOutput);
    const reconstruction = validateReconstruction(
      structured,
      images.map((image) => image.id),
    );
    return {
      reconstruction,
      extractions,
      provider: provider.id,
      model: response.model,
    };
  } catch {
    throw new AiError(
      "INVALID_OUTPUT",
      "The reconstruction contained invalid structure or unsupported image references. Your source photographs are saved; try processing again.",
    );
  }
}

export async function benchmark(
  providerId: ProviderId,
  inputImages: VisionImage[],
  prompt: string,
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
      provider.generate({ system: EVIDENCE_SYSTEM_PROMPT, prompt, images }),
    );
    return { ...result, durationMs: Math.round(performance.now() - start) };
  } catch (error) {
    throw safeAiError(error);
  }
}
