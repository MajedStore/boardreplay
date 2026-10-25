import type { Reconstruction } from "@/lib/types";
import { sceneReconstruction, type DemoFrame } from "@/lib/demo";
import { disciplineFrames } from "@/lib/demo-scenes.mjs";

export type DisciplineExample = "circuit" | "advanced-math" | "text-table";
export const disciplineExamples = {
  circuit: {
    title: "RC circuit: preserve the original diagram",
    course: "Electrical engineering",
    disciplines: ["Electrical engineering", "Physics"],
    concepts: ["RC circuit", "Source-region preservation", "Time constant"],
  },
  "advanced-math": {
    title: "The spectral theorem for real symmetric matrices",
    course: "Advanced linear algebra",
    disciplines: ["Advanced mathematics"],
    concepts: [
      "Orthogonal eigendecomposition",
      "Spectral theorem",
      "Rank-one projections",
    ],
  },
  "text-table": {
    title: "Economics: nominal and real output",
    course: "Macroeconomics",
    disciplines: ["Economics"],
    concepts: [
      "Nominal and real GDP",
      "Base-year prices",
      "Chronological table changes",
    ],
  },
} as const;

export function disciplineReconstruction(
  example: DisciplineExample,
  imageIds: string[],
): Reconstruction {
  const definition = disciplineExamples[example];
  const reconstruction = sceneReconstruction(
    imageIds,
    disciplineFrames[example] as unknown as DemoFrame[],
  );
  return {
    ...reconstruction,
    title: definition.title,
    overview:
      "SYNTHETIC SAMPLE — Two original board images and their author-defined chronological reconstruction. Evidence regions are exact by construction. No live vision response or provider accuracy is implied.",
    disciplines: [...definition.disciplines],
    concepts: [...definition.concepts],
    sections: [{ id: "lecture", title: definition.course }],
    unresolved: [
      "Only content visible in the two synthetic captures is represented. No intermediate handwriting or exact timing can be recovered.",
    ],
  };
}
export const engineeringCircuitReconstruction = (imageIds: string[]) =>
  disciplineReconstruction("circuit", imageIds);
export const advancedMathReconstruction = (imageIds: string[]) =>
  disciplineReconstruction("advanced-math", imageIds);
export const textTableReconstruction = (imageIds: string[]) =>
  disciplineReconstruction("text-table", imageIds);
