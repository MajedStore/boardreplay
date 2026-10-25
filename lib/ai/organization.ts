import { createHash } from "node:crypto";
import type { PhotoOrganization } from "../types";
import type { PhotoMetrics } from "../photos/metrics";
import { compareAllPhotoMetrics } from "../photos/metrics";
import { photoOrganizationSchema, type ImageExtraction } from "./wire-schemas";
import type { VisionImage } from "./contracts";

export const PHOTO_PIPELINE_VERSION = "photo-organization-v2-source-recovery";
export const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function pixelFingerprint(image: VisionImage, metrics: PhotoMetrics[]) {
  return metrics.find((item) => item.imageId === image.id)?.pixelSha256 || digest({ mimeType: image.mimeType, base64: image.base64 });
}

/** Provider statements are checked against image identity, graph consistency and actual pixels. */
export function validatePhotoOrganization(value: unknown, images: VisionImage[], extractions: ImageExtraction[], metrics: PhotoMetrics[] = []): PhotoOrganization {
  const result: PhotoOrganization = photoOrganizationSchema.parse(value);
  result.mode = "AUTOMATIC";
  const imageIds = new Set(images.map((image) => image.id));
  const used = new Set<string>(), sequenceIds = new Set<string>(), stateIds = new Set<string>();
  for (const sequence of result.sequences) {
    if (!sequence.id.trim() || sequenceIds.has(sequence.id)) throw new Error("Sequence IDs must be unique.");
    sequenceIds.add(sequence.id);
    for (const state of sequence.states) {
      if (!state.id.trim() || stateIds.has(state.id)) throw new Error("Board state IDs must be unique.");
      stateIds.add(state.id);
      if (!state.reason.trim() || !state.imageIds.includes(state.primaryImageId)) throw new Error("A board state must explain its grouping and select one of its photos.");
      for (const id of state.imageIds) {
        if (!imageIds.has(id) || used.has(id)) throw new Error("Every photograph must appear in exactly one organized board state.");
        used.add(id);
      }
      const states = extractions.filter((observation) => state.imageIds.includes(observation.imageId)).map((item) => item.boardState);
      if (states.includes("BLANK") && states.includes("CONTENT")) throw new Error("A blank board and visible writing are different captured states.");
    }
  }
  if (used.size !== images.length) throw new Error("Photo organization omitted an uploaded photograph.");
  const before = new Map<string, Set<string>>();
  for (const relationship of result.relationships) {
    if (!imageIds.has(relationship.fromImageId) || !imageIds.has(relationship.toImageId) || relationship.fromImageId === relationship.toImageId || !relationship.reason.trim()) throw new Error("Invalid photographic relationship.");
    if (relationship.kind === "BEFORE" && relationship.confidence !== "LOW") {
      const targets = before.get(relationship.fromImageId) || new Set<string>();
      targets.add(relationship.toImageId); before.set(relationship.fromImageId, targets);
    }
  }
  function visit(id: string, path: Set<string>) {
    if (path.has(id)) throw new Error("The proposed chronology contains a cycle.");
    const next = new Set(path).add(id);
    for (const target of before.get(id) || []) visit(target, next);
  }
  for (const id of imageIds) visit(id, new Set());
  const stateOf = new Map(result.sequences.flatMap((sequence) => sequence.states.flatMap((state) => state.imageIds.map((id) => [id, state.id] as const))));
  for (const [source, targets] of before) for (const target of targets) if (stateOf.get(source) === stateOf.get(target)) throw new Error("A meaningful progression cannot be collapsed into a duplicate board state.");

  const similarities = metrics.length ? compareAllPhotoMetrics(metrics) : [];
  for (const sequence of result.sequences) for (const state of sequence.states) {
    if (state.imageIds.length < 2) continue;
    const connected = new Set([state.primaryImageId]);
    for (let pass = 0; pass < state.imageIds.length; pass++) for (const id of state.imageIds) {
      if (connected.has(id)) continue;
      const evidence = [...connected].some((other) =>
        similarities.some((pair) => pair.exactPixels && pair.imageIds.includes(id) && pair.imageIds.includes(other)) ||
        result.relationships.some((relation) => relation.kind === "SAME_STATE" && relation.confidence !== "LOW" && ((relation.fromImageId === id && relation.toImageId === other) || (relation.fromImageId === other && relation.toImageId === id))) ||
        // Identical encoded source pixels are also exact evidence when no metrics callback was supplied.
        (!metrics.length && images.find((image) => image.id === id)?.mimeType === images.find((image) => image.id === other)?.mimeType && images.find((image) => image.id === id)?.base64 === images.find((image) => image.id === other)?.base64));
      if (evidence) connected.add(id);
    }
    if (connected.size !== state.imageIds.length) throw new Error("Grouped photographs need connected same-state visual evidence; overlap alone cannot hide a meaningful change.");
  }
  for (const group of result.duplicateGroups) {
    if (new Set(group.imageIds).size !== group.imageIds.length || group.imageIds.some((id) => !imageIds.has(id)) || !group.imageIds.includes(group.primaryImageId) || !group.reason.trim()) throw new Error("Invalid duplicate group.");
    if (group.kind === "EXACT" && !group.imageIds.every((id) => id === group.primaryImageId || similarities.some((pair) => pair.exactPixels && pair.imageIds.includes(id) && pair.imageIds.includes(group.primaryImageId)))) {
      group.kind = "POSSIBLE";
      group.reason += " Exact pixel identity was not established; originals are retained for review.";
    }
    if (group.kind === "SAME_STATE" && !group.imageIds.every((id) => stateOf.get(id) === stateOf.get(group.primaryImageId))) group.kind = "POSSIBLE";
  }
  // Exact byte/pixel matches are recorded independently of the model. They are not
  // automatically erased from chronology: a repeated state can be meaningful.
  const exactGroups = new Map<string, string[]>();
  for (const metric of metrics) {
    const key = `${metric.width}:${metric.height}:${metric.pixelSha256}`;
    exactGroups.set(key, [...(exactGroups.get(key) || []), metric.imageId]);
  }
  for (const ids of exactGroups.values()) {
    if (ids.length < 2 || result.duplicateGroups.some((group) => group.kind === "EXACT" && ids.every((id) => group.imageIds.includes(id)))) continue;
    const primaryImageId = [...ids].sort((a, b) => (metrics.find((item) => item.imageId === b)?.qualityScore || 0) - (metrics.find((item) => item.imageId === a)?.qualityScore || 0))[0];
    result.duplicateGroups.push({ imageIds: ids, primaryImageId, kind: "EXACT", reason: "Decoded prepared pixels are identical. All original files are retained." });
  }
  // A display order is not a chronology. Break chains with no supported visible
  // transition instead of fabricating continuity across erased/unrelated boards.
  const sequences: PhotoOrganization["sequences"] = [];
  let split = 0;
  for (const sequence of result.sequences) {
    let current = { ...sequence, states: [sequence.states[0]] };
    for (let index = 1; index < sequence.states.length; index++) {
      const previous = sequence.states[index - 1], next = sequence.states[index];
      const supported = result.relationships.some((relation) => relation.kind === "BEFORE" && relation.confidence !== "LOW" && previous.imageIds.includes(relation.fromImageId) && next.imageIds.includes(relation.toImageId));
      if (supported && sequence.orderingConfidence !== "LOW") current.states.push(next);
      else {
        current.orderingConfidence = "LOW";
        current.uncertainty ||= "The relationship to another board state could not be established.";
        sequences.push(current);
        current = { ...sequence, id: `${sequence.id}-uncertain-${++split}`, orderingConfidence: "LOW", uncertainty: "No reliable visual chronology links this group to the preceding displayed group.", states: [next] };
      }
    }
    if (current.orderingConfidence === "LOW") current.uncertainty ||= "Chronological ordering is uncertain; review these photos.";
    sequences.push(current);
  }
  result.sequences = sequences;
  if (sequences.length > 1) result.warnings.push("Separate board sequences are shown as groups. Their display order does not establish a chronology between them.");
  if (sequences.some((sequence) => sequence.orderingConfidence === "LOW")) result.warnings.push("Some photo ordering is uncertain. Review photos or choose a manual order if you know the lecture sequence.");
  result.warnings = [...new Set(result.warnings)];
  return result;
}

/** Explicit user correction supersedes inferred order, while preserving separate board groups. */
export function applyManualPhotoOrder(organization: PhotoOrganization, images: VisionImage[]): PhotoOrganization {
  const result = structuredClone(organization);
  result.mode = "MANUAL";
  const memberships = new Map(organization.sequences.flatMap((sequence) => sequence.states.flatMap((state) => state.imageIds.map((id) => [id, { sequence, state }] as const))));
  const sequences: PhotoOrganization["sequences"] = [];
  let previousSequence = "";
  for (const [index, image] of [...images].sort((a, b) => a.sequence - b.sequence).entries()) {
    const membership = memberships.get(image.id)!;
    if (membership.sequence.id !== previousSequence) sequences.push({ ...membership.sequence, id: `manual-sequence-${index}`, orderingConfidence: "HIGH", uncertainty: "Photo order was explicitly supplied by the user; it is not an AI certainty claim.", states: [] });
    sequences.at(-1)!.states.push({ ...membership.state, id: `manual-state-${index}`, imageIds: [image.id], primaryImageId: image.id, reason: "User-selected photo order.", confidence: "HIGH" });
    previousSequence = membership.sequence.id;
  }
  result.sequences = sequences;
  result.warnings.push("Manual order is in use. Every original photo remains available; duplicate suggestions are informational.");
  return result;
}
