import type {
  ComparisonRun,
  EvaluationScores,
  ProviderId,
  ProviderResult,
  ReportDraft,
} from "./types";
import {
  BENCHMARK_WRAPPER_VERSION,
  buildManualBenchmarkPrompt,
} from "./benchmark";
export type {
  ComparisonRun,
  EvaluationCategory,
  EvaluationScores,
  ProviderResult,
  ReportDraft,
} from "./types";
export const PROVIDERS = ["openai", "gemini", "anthropic"] as const;
export type ComparisonProvider = ProviderId;

export const PROVIDER_LABELS: Record<ComparisonProvider, string> = {
  openai: "ChatGPT / OpenAI",
  gemini: "Google Gemini",
  anthropic: "Claude / Anthropic",
};

export const EVALUATION_CATEGORIES = [
  {
    key: "textAccuracy",
    label: "Text extraction",
    description: "Does the transcription match the visible words?",
  },
  {
    key: "equationAccuracy",
    label: "Technical content",
    description:
      "Are code, symbols, formulas, labels, and diagram relationships transcribed faithfully?",
  },
  {
    key: "chronology",
    label: "Chronological ordering",
    description: "Does the inferred order match visible development, with uncertain relationships clearly identified?",
  },
  {
    key: "erasedContent",
    label: "Earlier erased content",
    description: "Is content captured in earlier photographs preserved?",
  },
  {
    key: "deduplication",
    label: "Deduplication",
    description: "Are overlaps merged without losing meaningful changes?",
  },
  {
    key: "missingInformation",
    label: "Missing information",
    description: "Are gaps and unreadable passages clearly identified?",
  },
  {
    key: "hallucinationAvoidance",
    label: "Hallucination avoidance",
    description:
      "Does the output avoid unsupported statements and invented evidence?",
  },
  {
    key: "readability",
    label: "Overall readability",
    description: "Is the reconstructed lesson clear and useful?",
  },
] as const;

export const DEFAULT_EVALUATION_PROMPT = `Organize these unordered university lecture photographs into an evidence-based sequence and provide a clear contextual academic explanation for EACH original photograph directly below its photo reference. Use actual visible content, repeated writing, additions, corrections, erasures, overlap, and reliable metadata as supporting evidence. Filenames and upload order do not establish chronology. Preserve every original, including duplicate views; explain repeated content briefly and distinguish complementary clearer views from meaningful new stages. Keep unrelated or weakly ordered photographs in explicitly uncertain separate sequences. Preserve the lecture language, including Turkish, and its university level across mathematics, programming, engineering, prose, tables, and diagrams. Explain what each photo shows, what changes from earlier photos, and what its notation means without unnecessarily repeating unchanged content. Use LaTeX and fenced source code where appropriate in ordinary document flow. Separate visible evidence, derived explanations, and uncertain or unreadable content. Cite supplied image IDs for each explanation. Do not invent missing symbols, uncaptured erased writing, diagrams, spoken remarks, or causal continuity. Do not generate a spatial canvas, coordinates, or floating text elements. Return the proposed order, a distinct explanation linked to every photo, duplicate/overlap notes, and unresolved questions.`;

export function isValidScore(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 5
  );
}

export function completedScoreCount(scores: EvaluationScores): number {
  return EVALUATION_CATEGORIES.filter(({ key }) => isValidScore(scores[key]))
    .length;
}

export function totalScore(scores: EvaluationScores): number | null {
  if (completedScoreCount(scores) !== EVALUATION_CATEGORIES.length) return null;
  return EVALUATION_CATEGORIES.reduce(
    (total, { key }) => total + (scores[key] ?? 0),
    0,
  );
}

export function sameBenchmark(
  run: Pick<ComparisonRun, "imageIds" | "prompt">,
  other: Pick<ComparisonRun, "imageIds" | "prompt">,
): boolean {
  return (
    run.prompt === other.prompt &&
    run.imageIds.length === other.imageIds.length &&
    run.imageIds.every((id, index) => id === other.imageIds[index])
  );
}

export interface RankedResult {
  result: ProviderResult;
  total: number;
  rank: number;
}

/** Rankings use only explicit, complete human scores for the identical benchmark. */
export function rankResults(run: ComparisonRun): RankedResult[] {
  // Results belong to one immutable prompt and ordered image snapshot on the server.
  if (!run.prompt.trim() || run.imageIds.length === 0) return [];
  const eligible = run.results.filter(
    (result) => totalScore(result.scores) !== null,
  );
  // Avoid treating repeated runs of one provider as independent tools.
  const latest = new Map<ComparisonProvider, ProviderResult>();
  for (const result of eligible) {
    const previous = latest.get(result.provider);
    if (!previous || result.createdAt >= previous.createdAt)
      latest.set(result.provider, result);
  }
  if (latest.size < 2) return [];
  const ordered = [...latest.values()]
    .map((result) => ({ result, total: totalScore(result.scores)!, rank: 0 }))
    .sort(
      (a, b) =>
        b.total - a.total || a.result.provider.localeCompare(b.result.provider),
    );
  ordered.forEach((entry, index) => {
    entry.rank =
      index > 0 && entry.total === ordered[index - 1].total
        ? ordered[index - 1].rank
        : index + 1;
  });
  return ordered;
}

export function normalizeReference(text: string): string {
  return text.normalize("NFC").replace(/\s+/gu, " ").trim();
}

export function editDistance(
  a: readonly string[],
  b: readonly string[],
): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 0; i < a.length; i++) {
    const current = [i + 1];
    for (let j = 0; j < b.length; j++) {
      current.push(
        Math.min(
          current[j] + 1,
          previous[j + 1] + 1,
          previous[j] + (a[i] === b[j] ? 0 : 1),
        ),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

export interface ReferenceMetrics {
  exactMatch: boolean;
  wordEdits: number;
  referenceWords: number;
  outputWords: number;
  wordErrorRate: number;
}

/** Textual agreement is not a mathematical or semantic correctness assessment. */
export function referenceMetrics(
  reference: string,
  output: string,
): ReferenceMetrics | null {
  const normalizedReference = normalizeReference(reference);
  if (!normalizedReference) return null;
  const normalizedOutput = normalizeReference(output);
  const expected = normalizedReference.split(" ");
  const actual = normalizedOutput ? normalizedOutput.split(" ") : [];
  // Bound work for pasted book-length outputs; no truncated metric is reported.
  if (expected.length > 3000 || actual.length > 3000) return null;
  const wordEdits = editDistance(expected, actual);
  return {
    exactMatch: normalizedReference === normalizedOutput,
    wordEdits,
    referenceWords: expected.length,
    outputWords: actual.length,
    wordErrorRate: wordEdits / expected.length,
  };
}

function csvCell(value: unknown): string {
  let text =
    value === undefined || value === null
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  // Spreadsheet formula injection protection applies even inside quoted CSV cells.
  if (/^[\s]*[=+@-]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function comparisonCsv(run: ComparisonRun): string {
  const columns = [
    "run_id",
    "lesson_id",
    "provider",
    "model",
    "mode",
    "timestamp",
    "image_ids_in_order",
    "evaluation_prompt",
    "raw_output",
    "notes",
    "duration_ms",
    ...EVALUATION_CATEGORIES.map(({ key }) => key),
    "total_out_of_40",
    "verified_reference",
    "word_edits",
    "word_error_rate",
    "benchmark_wrapper_version",
    "equivalent_manual_prompt",
  ];
  const rows = run.results.map((result) => {
    const metrics = referenceMetrics(run.reference, result.rawOutput);
    return [
      run.id,
      run.lessonId,
      result.provider,
      result.model,
      result.mode,
      result.createdAt,
      run.imageIds,
      run.prompt,
      result.rawOutput,
      result.notes,
      result.durationMs,
      ...EVALUATION_CATEGORIES.map(({ key }) => result.scores[key]),
      totalScore(result.scores),
      run.reference,
      metrics?.wordEdits,
      metrics?.wordErrorRate,
      run.wrapperVersion || BENCHMARK_WRAPPER_VERSION,
      buildManualBenchmarkPrompt(run),
    ]
      .map(csvCell)
      .join(",");
  });
  return [columns.map(csvCell).join(","), ...rows].join("\r\n");
}

export function scoreHighlights(scores: EvaluationScores): {
  strengths: string[];
  weaknesses: string[];
} {
  return {
    strengths: EVALUATION_CATEGORIES.filter(
      ({ key }) => isValidScore(scores[key]) && scores[key]! >= 4,
    ).map(({ label }) => label),
    weaknesses: EVALUATION_CATEGORIES.filter(
      ({ key }) => isValidScore(scores[key]) && scores[key]! <= 2,
    ).map(({ label }) => label),
  };
}

export function emptyReportDraft(): ReportDraft {
  return {
    problem:
      "Students capture whiteboards at different points in a lecture. The resulting photographs contain overlapping material, erased steps, and incomplete context.",
    objective:
      "Organize unordered lecture photographs and provide contextual, source-linked explanations below each original image.",
    methodology:
      "Evaluate the same photo set using an identical saved prompt and attachment order, without treating upload labels as chronology. Record the provider and model, retain the raw output, and assess eight categories on a 0–5 rubric against a verified reference. Treat manual submissions as manual. Text agreement metrics measure transcription differences, not semantic correctness.",
    implementation:
      "BoardReplay combines original image storage, server-side vision analysis, automatic ordering, per-photo contextual explanations, manual corrections, and photo-document PDF export.",
    limitations:
      "Writing that was erased before any photograph was taken cannot be recovered. Handwriting, ambiguous notation, and incomplete image coverage can cause errors. Human rubric scores are subjective, and textual agreement does not establish mathematical correctness.",
    conclusion: "",
  };
}
