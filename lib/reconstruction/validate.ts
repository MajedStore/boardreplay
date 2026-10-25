import type { BoardElement, BoardRect, Reconstruction } from "../types";
import { reconstructionSchema } from "../validation/schemas";
import { verifyArithmetic } from "./arithmetic";
import { recoverReconstructionRegions } from "./source-regions";

export interface ReconstructionValidationOptions {
  requireVisual?: boolean;
  checkChronology?: boolean;
  stateImageIds?: readonly (readonly string[])[];
  sequenceStartIndices?: readonly number[];
}
function checkRect(rect: BoardRect, label: string) {
  if (rect.x + rect.width > 1.000001 || rect.y + rect.height > 1.000001)
    throw new Error(`${label} extends outside its normalized canvas.`);
}
function addWarning(previous: string | null | undefined, text: string) {
  return previous?.includes(text)
    ? previous
    : [previous, text].filter(Boolean).join(" ");
}
function evidence<
  T extends {
    sourceImageIds: string[];
    evidenceStatus: string;
    uncertainty?: string | null;
  },
>(value: T): T {
  value.sourceImageIds = [...new Set(value.sourceImageIds)];
  if (!value.sourceImageIds.length && value.evidenceStatus !== "USER_EDITED") {
    value.evidenceStatus = "UNCERTAIN";
    value.uncertainty = addWarning(
      value.uncertainty,
      "No source photograph was cited. This content is unsupported by captured evidence.",
    );
  }
  return value;
}

/** Validate an immutable chronological event log, including identities, topology, and evidence. */
export function validateReconstruction(
  value: unknown,
  imageIds: readonly string[],
  options: ReconstructionValidationOptions = {},
): Reconstruction {
  const reconstruction = reconstructionSchema.parse(recoverReconstructionRegions(value, imageIds));
  const images = new Set(imageIds),
    sections = new Set(reconstruction.sections.map((s) => s.id));
  if (sections.size !== reconstruction.sections.length)
    throw new Error("Section IDs must be unique.");
  if (options.requireVisual && reconstruction.schemaVersion !== 2)
    throw new Error("A spatial reconstruction is required.");
  const stepIds = new Set<string>(),
    changeIds = new Set<string>(),
    everUsed = new Set<string>();
  const active = new Map<string, BoardElement>();
  const ordered = [...reconstruction.steps].sort(
    (a, b) => a.stepIndex - b.stepIndex,
  );
  const stateImages = options.stateImageIds ?? imageIds.map((id) => [id]);
  const sourcePositions = new Map(stateImages.flatMap((group, index) => group.map((id) => [id, index] as const)));
  const sequenceStarts = new Set(options.sequenceStartIndices ?? [0]);
  if (options.checkChronology) {
    if (ordered.length !== stateImages.length)
      throw new Error("Each organized board state must have one captured moment.");
    const coverage = stateImages.flat();
    if (new Set(coverage).size !== imageIds.length || coverage.length !== imageIds.length || coverage.some((id) => !images.has(id)))
      throw new Error("Organized states must account for every supplied photograph exactly once.");
  }
  let sequenceStart = 0;
  const steps = ordered.map((moment, index) => {
    if (stepIds.has(moment.id)) throw new Error("Step IDs must be unique.");
    stepIds.add(moment.id);
    if (!sections.has(moment.sectionId))
      throw new Error("Every moment must reference an existing section.");
    if (moment.sourceImageIds.some((id) => !images.has(id)))
      throw new Error("A moment references an image outside this lesson.");
    evidence(moment);
    if (options.checkChronology) {
      if (sequenceStarts.has(index)) sequenceStart = index;
      if (stateImages[index].some((id) => !moment.sourceImageIds.includes(id)))
        throw new Error(
          "A moment must cite every photograph supporting its organized board state.",
        );
      if (moment.sourceImageIds.some((id) => sourcePositions.get(id)! > index || sourcePositions.get(id)! < sequenceStart))
        throw new Error("A moment cites a future photograph or an unrelated earlier sequence.");
      if (index > 0 && sequenceStarts.has(index) && moment.changes?.[0]?.action !== "NEW_TOPIC")
        throw new Error("A separate board sequence must begin with an explicit scene boundary.");
    }
    if (moment.explanation && moment.evidenceStatus === "OBSERVED")
      moment.evidenceStatus = "DERIVED";
    if (reconstruction.schemaVersion === 2 && !Array.isArray(moment.changes))
      throw new Error("Each spatial moment must contain a board change array.");
    for (const change of moment.changes ?? []) {
      if (changeIds.has(change.id))
        throw new Error("Change IDs must be unique.");
      changeIds.add(change.id);
      if (change.action === "NEW_TOPIC") {
        if (change.targetId !== null || change.element !== null)
          throw new Error("NEW_TOPIC has no target or element payload.");
        active.clear();
        continue;
      }
      if (change.action === "ERASE" || change.action === "UNCHANGED") {
        if (
          !change.targetId ||
          !active.has(change.targetId) ||
          change.element !== null
        )
          throw new Error(
            `${change.action} must reference an active element without a new payload.`,
          );
        if (change.action === "ERASE") active.delete(change.targetId);
        continue;
      }
      const element = change.element;
      if (!element)
        throw new Error("A visible change requires a complete element.");
      if (change.action === "ADD") {
        if (change.targetId !== null || everUsed.has(element.id))
          throw new Error(
            "ADD requires a never-used element ID and no target.",
          );
        everUsed.add(element.id);
      } else if (
        !change.targetId ||
        !active.has(change.targetId) ||
        element.id !== change.targetId
      ) {
        throw new Error(
          "MODIFY and CORRECT must keep the active target identity.",
        );
      }
      if (
        element.sourceImageIds.some(
          (id) => !images.has(id) || !moment.sourceImageIds.includes(id),
        )
      )
        throw new Error(
          "Element source references must belong to this lesson and its captured moment.",
        );
      if (options.requireVisual && !element.sourceImageIds.length)
        throw new Error(
          "Every automatic element must cite photographed evidence.",
        );
      evidence(element);
      checkRect(element.layout, "Element layout");
      if (
        element.evidenceStatus === "UNCERTAIN" &&
        !element.uncertainty?.trim()
      ) {
        if (options.requireVisual)
          throw new Error(
            "Uncertain automatic elements must describe the ambiguity.",
          );
        element.uncertainty =
          "The provider marked this element uncertain without describing the ambiguity. Inspect the original photograph.";
      }
      if (element.sourceRegion) {
        if (!element.sourceImageIds.includes(element.sourceRegion.imageId))
          throw new Error(
            "A source region must reference one of the element’s cited images.",
          );
        checkRect(element.sourceRegion, "Source region");
      }
      if (element.sourceView && !element.sourceImageIds.includes(element.sourceView.imageId))
        delete element.sourceView;
      const needsGraphicFallback =
        ["arrow", "shape"].includes(element.type) ||
        (!element.latex &&
          ["diagram", "uml", "circuit", "flowchart", "graph", "drawing"].includes(
            element.type,
          ));
      if (!element.visual && needsGraphicFallback) {
        element.semanticLabel = element.semanticLabel ?? element.type;
        element.type = "image_crop";
      }
      if (element.layoutBasis === "AUTO_LAYOUT")
        element.uncertainty = addWarning(
          element.uncertainty,
          "Spatial position was not recovered; this is an automatic reading layout.",
        );
      active.set(element.id, element);
    }
    // End-of-moment checks let an arrow refer to nodes introduced in the same photograph.
    for (const element of active.values()) {
      if (!element.visual) continue;
      const { shape, fromId, toId, points } = element.visual;
      if ((fromId && !active.has(fromId)) || (toId && !active.has(toId)))
        throw new Error(
          "A connection references an element absent from the current board.",
        );
      if (
        (shape === "arrow" || shape === "line") &&
        points.length < 2 &&
        !(fromId && toId)
      )
        throw new Error(
          "A connection needs observed points or two active endpoints.",
        );
    }
    return {
      ...moment,
      stepIndex: index,
      verification:
        moment.type === "equation" || moment.type === "derivation"
          ? verifyArithmetic(moment.latex || moment.text)
          : null,
    };
  });
  return { ...reconstruction, steps };
}

/** Deleted photos never silently reappear as apparently valid sources when restoring history. */
export function reconcileMissingSources(
  value: unknown,
  imageIds: readonly string[],
): { reconstruction: Reconstruction; missingImageIds: string[] } {
  const reconstruction = reconstructionSchema.parse(recoverReconstructionRegions(value, imageIds)),
    available = new Set(imageIds),
    missing = new Set<string>();
  function reconcile<
    T extends {
      sourceImageIds: string[];
      evidenceStatus: string;
      uncertainty?: string | null;
    },
  >(item: T): T {
    const removed = item.sourceImageIds.filter((id) => !available.has(id));
    if (removed.length) {
      removed.forEach((id) => missing.add(id));
      item.sourceImageIds = item.sourceImageIds.filter((id) =>
        available.has(id),
      );
      item.evidenceStatus = "UNCERTAIN";
      item.uncertainty = addWarning(
        item.uncertainty,
        "A source photograph referenced by this content was removed and is no longer available.",
      );
    }
    return item;
  }
  for (const moment of reconstruction.steps) {
    reconcile(moment);
    for (const change of moment.changes ?? [])
      if (change.element) {
        reconcile(change.element);
        if (
          change.element.sourceRegion &&
          !available.has(change.element.sourceRegion.imageId)
        )
          change.element.sourceRegion = null;
        if (change.element.sourceView && !available.has(change.element.sourceView.imageId))
          delete change.element.sourceView;
      }
  }
  return {
    reconstruction: validateReconstruction(reconstruction, imageIds),
    missingImageIds: [...missing],
  };
}

/** Freeze the analyzed rotation: region coordinates refer to prepared images, not raw originals. */
export function stampSourceRotations(
  reconstruction: Reconstruction,
  images: { id: string; rotation: number; preparedAspectRatio?: number }[],
): Reconstruction {
  const rotated = structuredClone(reconstruction);
  for (const moment of rotated.steps)
    for (const change of moment.changes ?? []) {
      const element = change.element;
      const sourceId = element?.sourceRegion?.imageId || element?.sourceImageIds[0];
      const source = images.find((image) => image.id === sourceId);
      if (element && source)
        element.sourceView = { imageId: source.id, rotation: source.rotation, imageAspectRatio: source.preparedAspectRatio };
      const region = element?.sourceRegion;
      if (region) {
        const image = images.find((image) => image.id === region.imageId);
        region.rotation = image?.rotation;
        region.imageAspectRatio = image?.preparedAspectRatio;
      }
    }
  return rotated;
}
