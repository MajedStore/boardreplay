import { EVIDENCE_SYSTEM_PROMPT } from "./ai/prompts";
import type { ComparisonRun } from "./types";

/** Static wrapper version; changing these instructions requires a new benchmark. */
export const BENCHMARK_WRAPPER_VERSION = "boardreplay-benchmark-v2";

export function benchmarkImageLabel(image: {
  id: string;
  sequence: number;
}): string {
  return `Source image ${image.sequence + 1}; image ID: ${image.id}`;
}

/** Official interfaces cannot set an API system role: preserve its full text in the copied prompt. */
export function buildManualBenchmarkPrompt(
  run: Pick<
    ComparisonRun,
    "prompt" | "imageSnapshot" | "systemInstructions" | "wrapperVersion"
  >,
): string {
  const orderedImages = [...run.imageSnapshot].sort(
    (left, right) => left.sequence - right.sequence,
  );
  // Legacy records without an instruction snapshot must never be relabeled as a new experiment.
  const rules =
    run.systemInstructions ||
    (run.wrapperVersion
      ? "[Historical system instructions were not saved. Create a new benchmark to run comparable experiments.]"
      : EVIDENCE_SYSTEM_PROMPT);
  return [rules, run.prompt, ...orderedImages.map(benchmarkImageLabel)].join(
    "\n\n",
  );
}

export function benchmarkImageUrl(
  comparisonId: string,
  imageId: string,
): string {
  return `/api/comparisons/${encodeURIComponent(comparisonId)}/images/${encodeURIComponent(imageId)}`;
}
