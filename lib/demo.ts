import type { Reconstruction, ReconstructionStep } from "@/lib/types";
export function sampleReconstruction(imageIds: string[]): Reconstruction {
  const [a, b, c, d] = imageIds;
  return {
    title: "Completing the square: finding both roots",
    overview:
      "A synthetic mathematics lesson showing the original setup, a positive-root-only draft, its visible correction, and verification of both solutions. This is prebuilt SAMPLE DATA, not a live AI response.",
    concepts: [
      "Completing the square",
      "Equivalent transformations",
      "Positive and negative square roots",
      "Checking solutions",
    ],
    sections: [
      { id: "setup", title: "01 · Complete the square" },
      { id: "correction", title: "02 · Preserve the correction" },
      { id: "result", title: "03 · Check the result" },
      { id: "next", title: "04 · What remains incomplete" },
    ],
    steps: (
      [
        {
          id: "s1",
          sectionId: "setup",
          type: "equation",
          text: "The original quadratic equation",
          latex: "x^2 - 6x + 5 = 0",
          stepIndex: 0,
          sourceImageIds: [a],
          evidenceStatus: "OBSERVED",
          originalText: "Solve: x² − 6x + 5 = 0",
        },
        {
          id: "s2",
          sectionId: "setup",
          type: "derivation",
          text: "Move the constant, then add 9 to both sides.",
          latex:
            "\\begin{aligned}x^2-6x&=-5\\\\x^2-6x+9&=-5+9\\\\x^2-6x+9&=4\\end{aligned}",
          stepIndex: 1,
          sourceImageIds: [a, b],
          evidenceStatus: "OBSERVED",
          originalText:
            "x² − 6x = −5; Add 9 to BOTH sides; x² − 6x + 9 = −5 + 9",
        },
        {
          id: "s3",
          sectionId: "setup",
          type: "equation",
          text: "Recognize the perfect square.",
          latex: "(x-3)^2=4",
          stepIndex: 2,
          sourceImageIds: [b, c],
          evidenceStatus: "OBSERVED",
          originalText: "(x − 3)² = 4",
        },
        {
          id: "s4",
          sectionId: "correction",
          type: "equation",
          text: "Earlier draft: only the positive square root was written. This incomplete version remains in the timeline.",
          latex: "x-3=2",
          stepIndex: 3,
          sourceImageIds: [b, c],
          evidenceStatus: "OBSERVED",
          originalText: "x − 3 = 2",
          uncertainty:
            "Incomplete draft; corrected in the next captured frame.",
        },
        {
          id: "s5",
          sectionId: "correction",
          type: "derivation",
          text: "The next frame crosses out the draft and explicitly takes both square roots.",
          latex: "\\begin{aligned}x-3&=\\pm 2\\\\x&=3\\pm 2\\end{aligned}",
          stepIndex: 4,
          sourceImageIds: [c],
          evidenceStatus: "OBSERVED",
          originalText:
            "Correction: take BOTH square roots; x − 3 = ±2; x = 3 ± 2",
        },
        {
          id: "s6",
          sectionId: "correction",
          type: "paragraph",
          text: "Taking a square root requires both signs here: two real numbers, 2 and −2, square to 4. This explanation is supplied by the sample author.",
          stepIndex: 5,
          sourceImageIds: [b, c],
          evidenceStatus: "DERIVED",
          explanation: true,
        },
        {
          id: "s7",
          sectionId: "result",
          type: "equation",
          text: "The two solutions shown on the final board.",
          latex: "\\boxed{x=1\\quad\\text{or}\\quad x=5}",
          stepIndex: 6,
          sourceImageIds: [d],
          evidenceStatus: "OBSERVED",
          originalText: "x = 1 or x = 5",
        },
        {
          id: "s8",
          sectionId: "result",
          type: "derivation",
          text: "The final frame substitutes each root into the original equation.",
          latex: "\\begin{aligned}1^2-6(1)+5&=0\\\\5^2-6(5)+5&=0\\end{aligned}",
          stepIndex: 7,
          sourceImageIds: [d],
          evidenceStatus: "OBSERVED",
          originalText: "1² − 6(1) + 5 = 0; 5² − 6(5) + 5 = 0",
          verification: {
            status: "VERIFIED",
            message:
              "Direct arithmetic: 1 − 6 + 5 = 0 and 25 − 30 + 5 = 0. This checks these substitutions only.",
          },
        },
        {
          id: "s9",
          sectionId: "next",
          type: "equation",
          text: "A separate problem begins on the last board. Its solution was not captured.",
          latex: "x^2+4x+4=0",
          stepIndex: 8,
          sourceImageIds: [d],
          evidenceStatus: "OBSERVED",
          originalText:
            "Next problem: x² + 4x + 4 = 0 (not solved in captured frames)",
        },
        {
          id: "s10",
          sectionId: "next",
          type: "paragraph",
          text: "A homework page number is unreadable in the first frame.",
          stepIndex: 9,
          sourceImageIds: [a],
          evidenceStatus: "UNCERTAIN",
          originalText: "Homework: p. [?]",
          uncertainty:
            "The page number cannot be determined from the captured image.",
        },
      ] satisfies ReconstructionStep[]
    ).map((step) => ({
      ...step,
      verification: step.verification ?? {
        status: "NOT_VERIFIED" as const,
        message:
          "Transcribed sample; symbolic reasoning was not independently verified.",
      },
    })),
    unresolved: [
      "The homework page number is unreadable.",
      "The next problem is visible but its solution is absent. Nothing erased before the first photo can be recovered.",
    ],
  };
}
