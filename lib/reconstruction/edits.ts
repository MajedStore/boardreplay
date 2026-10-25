import type { BoardElement, Reconstruction, ReconstructionStep } from "../types";
import { getBoardScene, normalizeLegacyReconstruction } from "../board/scene";
import { validateReconstruction } from "./validate";
function signature(value: unknown) {
  return JSON.stringify(value);
}
/** Editing a moment caption must not rewrite its photographed scene events. */
export function updateMomentAnnotation(
  step: ReconstructionStep,
  content: { text: string; latex: string | null; uncertainty: string | null },
) {
  const noteId = `note-${step.id}`;
  if (Array.isArray(step.changes)) {
    const ownsNote = step.changes.some((change) => change.action === "ADD" && change.element?.id === noteId && change.element.evidenceStatus === "USER_EDITED");
    if (!ownsNote) return step.changes;
    const last = step.changes.findLastIndex((change) => (change.element?.id || change.targetId) === noteId);
    return step.changes.map((change, index) => index === last && change.element ? { ...change, element: { ...change.element, ...content } } : change);
  }
  if (!step.explanation || step.evidenceStatus !== "USER_EDITED" || step.sourceImageIds.length) return step.changes;
  return [{
    id: crypto.randomUUID(), action: "ADD" as const, targetId: null,
    description: "User added an explanatory annotation; no captured photograph is claimed.",
    element: {
      id: noteId, type: "annotation" as const, ...content,
      layout: { x: 0.05, y: 0.77, width: 0.9, height: 0.17 },
      layoutBasis: "USER_SET" as const, sourceImageIds: [],
      evidenceStatus: "USER_EDITED" as const, sourceRegion: null, visual: null,
    },
  }];
}
/** Identity and all prior content versions stay in history; edited payloads have user provenance. */
export function markUserEdits(
  next: Reconstruction,
  previous: Reconstruction | null,
): Reconstruction {
  const result = structuredClone(next);
  // Importing old notes supplies a reading layout, not a user correction.
  // Compare the same validated representation used by the PATCH route so its
  // automatic-layout notices do not change the provenance of untouched notes.
  const comparison =
    previous &&
    next.schemaVersion === 2 &&
    (previous.schemaVersion !== 2 ||
      previous.steps.some((moment) => !Array.isArray(moment.changes)))
      ? validateReconstruction(normalizeLegacyReconstruction(previous), [
          ...new Set(previous.steps.flatMap((moment) => moment.sourceImageIds)),
        ])
      : previous;
  for (const [index, moment] of result.steps.entries()) {
    const old = comparison?.steps.find((item) => item.id === moment.id);
    if (
      !old ||
      [
        "text",
        "latex",
        "evidenceStatus",
        "type",
        "uncertainty",
        "explanation",
        "sourceImageIds",
        "changes",
      ].some(
        (key) =>
          signature(old[key as keyof typeof old]) !==
          signature(moment[key as keyof typeof moment]),
      )
    ) {
      moment.evidenceStatus = "USER_EDITED";
      moment.originalText =
        old?.originalText ?? old?.text ?? moment.originalText ?? null;
      moment.verification = {
        status: "NOT_VERIFIED",
        message: "User correction; not independently verified.",
      };
    }
    for (const change of moment.changes ?? []) {
      if (!change.element) continue;
      const before =
        old?.changes?.find((item) => item.id === change.id)?.element ??
        (comparison
          ? getBoardScene(comparison, index).elements.find(
              (item) => item.id === change.element?.id,
            )
          : undefined);
      if (!before || signature(before) !== signature(change.element)) {
        change.element.evidenceStatus = "USER_EDITED";
        if (
          !before ||
          signature(before.layout) !== signature(change.element.layout)
        )
          change.element.layoutBasis = "USER_SET";
      }
    }
  }
  return result;
}
/** Useful to inspectors: find the event that introduced the currently visible version. */
export function elementVersionMoment(
  reconstruction: Reconstruction,
  index: number,
  element: BoardElement,
): number {
  for (
    let moment = Math.min(index, reconstruction.steps.length - 1);
    moment >= 0;
    moment--
  ) {
    if (
      reconstruction.steps[moment].changes?.some(
        (change) => change.element?.id === element.id,
      )
    )
      return moment;
  }
  return index;
}
