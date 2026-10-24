import type { Reconstruction } from "../types";
import { reconstructionSchema } from "../validation/schemas";
import { verifyArithmetic } from "./arithmetic";

/** Restored revisions may outlive a deleted source file. Preserve content without dangling citations. */
export function reconcileMissingSources(
  value: unknown,
  imageIds: readonly string[],
): { reconstruction: Reconstruction; missingImageIds: string[] } {
  const original = reconstructionSchema.parse(value);
  const available = new Set(imageIds);
  const missing = new Set<string>();
  const steps = original.steps.map((step) => {
    const removed = step.sourceImageIds.filter((id) => !available.has(id));
    if (!removed.length) return step;
    removed.forEach((id) => missing.add(id));
    return {
      ...step,
      sourceImageIds: step.sourceImageIds.filter((id) => available.has(id)),
      evidenceStatus: "UNCERTAIN" as const,
      uncertainty: [
        step.uncertainty,
        "A source photograph referenced by this content was removed and is no longer available.",
      ]
        .filter(Boolean)
        .join(" "),
    };
  });
  return {
    reconstruction: validateReconstruction({ ...original, steps }, imageIds),
    missingImageIds: [...missing],
  };
}

/** Enforces citation integrity and stable ordering for provider output and user edits. */
export function validateReconstruction(
  value: unknown,
  imageIds: readonly string[],
): Reconstruction {
  const reconstruction = reconstructionSchema.parse(value);
  const allowedImages = new Set(imageIds);
  const sectionIds = new Set(
    reconstruction.sections.map((section) => section.id),
  );
  if (sectionIds.size !== reconstruction.sections.length)
    throw new Error("Section IDs must be unique.");
  const stepIds = new Set<string>();
  const steps = [...reconstruction.steps]
    .sort((left, right) => left.stepIndex - right.stepIndex)
    .map((step, index) => {
      if (stepIds.has(step.id)) throw new Error("Step IDs must be unique.");
      stepIds.add(step.id);
      if (!sectionIds.has(step.sectionId))
        throw new Error("Every step must reference an existing section.");
      if (step.sourceImageIds.some((imageId) => !allowedImages.has(imageId)))
        throw new Error("A step references an image outside this lesson.");
      const sourceImageIds = [...new Set(step.sourceImageIds)];
      const missingSource =
        !sourceImageIds.length && step.evidenceStatus !== "USER_EDITED";
      const evidenceStatus = missingSource
        ? ("UNCERTAIN" as const)
        : step.explanation && step.evidenceStatus === "OBSERVED"
          ? ("DERIVED" as const)
          : step.evidenceStatus;
      const uncertainty = missingSource
        ? [
            step.uncertainty,
            "No source photograph was cited. This statement is unsupported by captured evidence.",
          ]
            .filter(Boolean)
            .join(" ")
        : step.uncertainty;
      return {
        ...step,
        stepIndex: index,
        sourceImageIds,
        evidenceStatus,
        uncertainty,
        verification:
          step.type === "equation" || step.type === "derivation" || step.latex
            ? verifyArithmetic(step.latex || step.text)
            : null,
      };
    });
  return { ...reconstruction, steps };
}
