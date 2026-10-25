import { describe, expect, it } from "vitest";
import {
  benchmarkImageLabel,
  buildManualBenchmarkPrompt,
} from "../lib/benchmark";
import { EVIDENCE_SYSTEM_PROMPT } from "../lib/ai/prompts";
import {
  comparisonCsv,
  completedScoreCount,
  EVALUATION_CATEGORIES,
  rankResults,
  referenceMetrics,
  sameBenchmark,
  totalScore,
  type ComparisonRun,
  type EvaluationScores,
  type ProviderResult,
} from "../lib/comparison";

const scores = Object.fromEntries(
  EVALUATION_CATEGORIES.map(({ key }) => [key, 4]),
) as EvaluationScores;
const result = (
  provider: ProviderResult["provider"],
  overrides: Partial<ProviderResult> = {},
): ProviderResult => ({
  id: provider,
  provider,
  model: "user-recorded",
  mode: "MANUAL",
  rawOutput: "x = 2",
  createdAt: "2026-10-24T09:00:00Z",
  notes: "",
  scores,
  durationMs: null,
  ...overrides,
});
const run = (results: ProviderResult[]): ComparisonRun => ({
  id: "run-1",
  lessonId: "lesson-1",
  prompt: "Transcribe the board",
  imageIds: ["frame-1", "frame-2"],
  imageSnapshot: [
    { id: "frame-1", sequence: 0, rotation: 0 },
    { id: "frame-2", sequence: 1, rotation: 0 },
  ],
  reference: "x = 2",
  results,
  createdAt: "2026-10-24T09:00:00Z",
  updatedAt: "2026-10-24T09:00:00Z",
});

describe("equivalent manual benchmark instructions", () => {
  it("preserves the exact API system rules, saved prompt and ordered source identifiers", () => {
    const benchmark = run([]);
    benchmark.imageSnapshot.reverse();
    const copied = buildManualBenchmarkPrompt(benchmark);
    expect(copied).toBe(
      [
        EVIDENCE_SYSTEM_PROMPT,
        benchmark.prompt,
        "Source image 1; image ID: frame-1",
        "Source image 2; image ID: frame-2",
      ].join("\n\n"),
    );
    expect(copied).toContain(
      benchmarkImageLabel({ id: "frame-1", sequence: 0 }),
    );
    expect(copied).not.toContain("lesson-1");
    expect(benchmark.imageSnapshot[0].id).toBe("frame-2");
  });
});

describe("comparison scoring", () => {
  it("requires all eight explicit valid scores, including zero", () => {
    expect(totalScore({})).toBeNull();
    expect(completedScoreCount({ ...scores, readability: Number.NaN })).toBe(7);
    expect(totalScore({ ...scores, readability: 6 })).toBeNull();
    expect(totalScore({ ...scores, readability: 2.5 })).toBeNull();
    expect(totalScore({ ...scores, readability: 0 })).toBe(28);
  });
  it("does not rank a single tool or an incomplete assessment", () => {
    expect(rankResults(run([result("openai")]))).toEqual([]);
    expect(
      rankResults(run([result("openai"), result("gemini", { scores: {} })])),
    ).toEqual([]);
  });
  it("excludes different prompts, image sets, and image orders", () => {
    const benchmark = run([]);
    expect(
      sameBenchmark(benchmark, {
        imageIds: ["frame-2", "frame-1"],
        prompt: benchmark.prompt,
      }),
    ).toBe(false);
    expect(
      sameBenchmark(benchmark, {
        imageIds: benchmark.imageIds,
        prompt: "Other prompt",
      }),
    ).toBe(false);
    expect(
      rankResults({
        ...run([result("openai"), result("gemini")]),
        imageIds: [],
      }),
    ).toEqual([]);
  });
  it("ranks distinct fully assessed tools, preserving ties", () => {
    const ranked = rankResults(
      run([
        result("openai"),
        result("gemini"),
        result("anthropic", { scores: { ...scores, readability: 3 } }),
      ]),
    );
    expect(ranked.map((entry) => entry.rank)).toEqual([1, 1, 3]);
    expect(ranked.map((entry) => entry.total)).toEqual([32, 32, 31]);
  });
  it("does not count repeated runs of one tool as multiple providers", () => {
    expect(
      rankResults(run([result("openai"), result("openai", { id: "later" })])),
    ).toEqual([]);
  });
});

describe("objective reference agreement", () => {
  it("normalizes whitespace without hiding symbol or case errors", () => {
    expect(referenceMetrics("x = 2", " x  =\n2 ")?.exactMatch).toBe(true);
    expect(referenceMetrics("x = 2", "x = -2")?.wordEdits).toBe(1);
    expect(referenceMetrics("X = 2", "x = 2")?.exactMatch).toBe(false);
  });
  it("does not fabricate metrics without a reference or for excessive inputs", () => {
    expect(referenceMetrics("  ", "output")).toBeNull();
    expect(referenceMetrics("word ".repeat(3001), "output")).toBeNull();
  });
  it("counts insertions and permits word error rates above 100%", () => {
    expect(referenceMetrics("x", "x extra extra")?.wordErrorRate).toBe(2);
    expect(referenceMetrics("x = 2", "")?.wordErrorRate).toBe(1);
  });
});

describe("comparison export", () => {
  it("includes provenance, actual zero scores, reference, and safe CSV cells", () => {
    const csv = comparisonCsv(
      run([
        result("openai", {
          rawOutput: '=HYPERLINK("bad")',
          notes: "line 1\nline 2",
          scores: { ...scores, readability: 0 },
        }),
      ]),
    );
    expect(csv).toContain("image_ids_in_order");
    expect(csv).toContain("verified_reference");
    expect(csv).toContain("'=");
    expect(csv).toContain('"0"');
    expect(csv).toContain('"line 1\nline 2"');
  });
});
