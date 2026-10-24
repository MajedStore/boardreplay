import { EVIDENCE_SYSTEM_PROMPT } from "./ai/prompts";
import type { ComparisonRun } from "./types";

/** Static wrapper version; changing these instructions requires a new benchmark. */
export const BENCHMARK_WRAPPER_VERSION = "boardreplay-benchmark-v1";

export function benchmarkImageLabel(image: { id: string; sequence: number }): string {
  return `Source image ${image.sequence + 1}; image ID: ${image.id}`;
}

/** Official interfaces cannot set an API system role: preserve its full text in the copied prompt. */
export function buildManualBenchmarkPrompt(run: Pick<ComparisonRun, "prompt" | "imageSnapshot">): string {
  const orderedImages = [...run.imageSnapshot].sort((left, right) => left.sequence - right.sequence);
  return [EVIDENCE_SYSTEM_PROMPT, run.prompt, ...orderedImages.map(benchmarkImageLabel)].join("\n\n");
}

export function benchmarkImageUrl(comparisonId: string, imageId: string): string {
  return `/api/comparisons/${encodeURIComponent(comparisonId)}/images/${encodeURIComponent(imageId)}`;
}
