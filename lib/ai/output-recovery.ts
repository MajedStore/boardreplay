import type { VisionImage } from "./contracts";
import { extractionSchema } from "./wire-schemas";
import { normalizeSourceRegion } from "../photos/source-regions";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => !!value && typeof value === "object" && !Array.isArray(value);
const unique = (values: string[]) => [...new Set(values)];
const messages = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const warning = (code: string, message: string) => `[Source recovery:${code}] ${message}`;
const append = (value: unknown, note: string) => unique([...(typeof value === "string" && value ? [value] : []), note]).join(" ");

/** The extraction request contains exactly one complete, already-oriented photo. */
export function normalizeObservationOutput(value: unknown, image: VisionImage): unknown {
  if (!record(value)) return value; // Core malformed structure is eligible for one bounded repair request.
  const data = structuredClone(value);
  const diagnostics: string[] = [];
  const suppliedImageId = data.imageId;
  const foreignPhoto = suppliedImageId !== undefined && suppliedImageId !== image.id;
  delete data.imageId;
  delete data.sequence;
  const items: unknown[] = [];
  for (const [index, raw] of (Array.isArray(data.items) ? data.items : []).entries()) {
    if (!record(raw)) {
      diagnostics.push(warning("ITEM_INVALID", `Photo ${image.id}: one malformed extracted item was omitted; other content was retained.`));
      continue;
    }
    const item = structuredClone(raw);
    const explicitSource = item.imageId ?? item.sourceImageId;
    const explicitSources = messages(item.sourceImageIds);
    if (foreignPhoto || (explicitSource !== undefined && explicitSource !== image.id) || explicitSources.some((id) => id !== image.id)) {
      diagnostics.push(warning("SOURCE_UNVERIFIED", `Photo ${image.id}: extracted content could not be attributed to this photo and was left unresolved${typeof item.text === "string" ? `: ${item.text.slice(0, 300)}` : "."}`));
      continue;
    }
    delete item.imageId;
    delete item.sourceImageId;
    delete item.sourceImageIds;
    const result = normalizeSourceRegion(item.sourceRegion, { imageId: image.id, allowedImageIds: [image.id], coordinateSpace: "NORMALIZED", format: "XYWH" });
    const notes = result.diagnostics.map((note) => warning(note.code, `Photo ${image.id}, item ${index + 1}: ${note.message}`));
    const region = result.region;
    item.sourceRegion = region ? { x: region.x, y: region.y, width: region.width, height: region.height } : null;
    for (const optional of ["semanticLabel", "latex", "codeLanguage", "visual", "uncertainty"]) if (item[optional] === undefined) item[optional] = null;
    if (notes.length) item.uncertainty = append(item.uncertainty, notes.join(" "));
    const parsed = extractionSchema.shape.items.element.safeParse(item);
    if (parsed.success) {
      items.push(parsed.data);
      diagnostics.push(...notes);
    } else if (typeof item.text === "string" && item.text.trim() && typeof item.id === "string" && item.id.trim()) {
      // Keep recognizable text while discarding malformed optional formatting, never synthesize its wording.
      const note = warning("ITEM_RECOVERED", `Photo ${image.id}: exact formatting for one extracted item was unavailable; its text was retained for review.`);
      items.push({ id: item.id, type: "other", semanticLabel: "Recovered text", text: item.text, latex: null, codeLanguage: null, linkingKey: typeof item.linkingKey === "string" ? item.linkingKey : item.text, sourceRegion: item.sourceRegion, mark: "VISIBLE", spatialRelationships: [], visual: null, uncertainty: append(item.uncertainty, note) });
      diagnostics.push(...notes, note);
    } else {
      diagnostics.push(warning("ITEM_INVALID", `Photo ${image.id}: one malformed extracted item was omitted; other content was retained.`));
    }
  }
  if (Array.isArray(data.items)) data.items = items;
  if (foreignPhoto) diagnostics.push(warning("SOURCE_UNVERIFIED", `Photo ${image.id}: the response identified a different photo. Its claimed content was not attributed to this source.`));
  if (foreignPhoto || (Array.isArray(data.items) && !items.length && diagnostics.length && data.boardState !== "BLANK")) {
    data.boardState = "UNREADABLE";
    data.items = [];
    data.unreadableRegions = unique([...messages(data.unreadableRegions), ...diagnostics, "The provider's extraction could not be verified. The original photograph is retained without invented transcription."]);
  }
  if (record(data.visualAssessment)) {
    const assessment = data.visualAssessment;
    const normalized = normalizeSourceRegion(assessment.boardBounds, { imageId: image.id, allowedImageIds: [image.id] });
    assessment.boardBounds = normalized.region ? { x: normalized.region.x, y: normalized.region.y, width: normalized.region.width, height: normalized.region.height } : null;
    diagnostics.push(...normalized.diagnostics.map((note) => warning(note.code, `Photo ${image.id}, board boundary: ${note.message}`)));
    if (Array.isArray(assessment.occlusions)) assessment.occlusions = assessment.occlusions.map((entry) => {
      if (!record(entry)) return entry;
      const result = normalizeSourceRegion(entry.region, { imageId: image.id, allowedImageIds: [image.id] });
      diagnostics.push(...result.diagnostics.map((note) => warning(note.code, `Photo ${image.id}, occlusion: ${note.message}`)));
      return { ...entry, region: result.region ? { x: result.region.x, y: result.region.y, width: result.region.width, height: result.region.height } : null };
    });
    assessment.qualityNotes = unique([...messages(assessment.qualityNotes), ...diagnostics]).slice(0, 12);
  }
  return data;
}

/** Source rectangles are optional metadata. Unknown photo citations do not acquire a replacement ID. */
export function normalizeReconstructionOutput(value: unknown, images: VisionImage[], fallback: { imageId: string; momentIndex: number; chunkIndex: number; activeElementIds?: readonly string[]; everUsedIds?: readonly string[] }): unknown {
  if (!record(value)) return value;
  const data = structuredClone(value);
  if (!Array.isArray(data.steps)) return data;
  const knownIds = new Set(images.map((image) => image.id));
  const diagnostics = messages(data.unresolved);
  for (const step of data.steps) {
    if (!record(step) || !Array.isArray(step.changes)) continue;
    if (Array.isArray(step.sourceImageIds)) {
      const original = step.sourceImageIds;
      const verified = original.filter((id): id is string => typeof id === "string" && knownIds.has(id));
      if (verified.length !== original.length) {
        const note = warning("SOURCE_UNVERIFIED", "Some moment photo references could not be verified. Current source-group coverage is retained without attributing unverified text.");
        step.sourceImageIds = verified.length ? verified : [fallback.imageId];
        step.evidenceStatus = "UNCERTAIN";
        step.uncertainty = append(step.uncertainty, note);
        diagnostics.push(note);
      }
    }
    let omitted = false;
    let unknownUnchanged = 0;
    const activeIds = fallback.activeElementIds ? new Set(fallback.activeElementIds) : null;
    const retained = step.changes.filter((change) => {
      if (activeIds && record(change) && change.action === "UNCHANGED" && change.element === null && typeof change.targetId === "string" && !activeIds.has(change.targetId)) {
        unknownUnchanged++;
        return false; // An unknown no-payload no-op cannot establish any board transition.
      }
      if (!record(change) || !record(change.element)) return true;
      const element = change.element;
      if (!Array.isArray(element.sourceImageIds)) return true; // Non-source core structure still needs schema repair.
      const all = element.sourceImageIds;
      const verified = all.filter((id): id is string => typeof id === "string" && knownIds.has(id));
      if (verified.length !== all.length) {
        const note = warning("SOURCE_UNVERIFIED", "Some photo references could not be verified. No replacement attribution was invented.");
        element.sourceImageIds = verified;
        element.evidenceStatus = "UNCERTAIN";
        element.uncertainty = append(element.uncertainty, note);
        diagnostics.push(note);
      }
      if (!verified.length) {
        diagnostics.push(warning("CONTENT_UNATTRIBUTED", `A change without a verifiable photo was omitted${typeof element.text === "string" ? `; unresolved text: ${element.text.slice(0, 300)}` : "."}`));
        omitted = true;
        return false;
      }
      const result = normalizeSourceRegion(element.sourceRegion, { allowedImageIds: verified, requireImageId: true, coordinateSpace: "NORMALIZED", format: "XYWH" });
      element.sourceRegion = result.region;
      if (result.diagnostics.length) {
        const notes = result.diagnostics.map((note) => warning(note.code, note.message));
        element.uncertainty = append(element.uncertainty, notes.join(" "));
        diagnostics.push(...notes);
      }
      return true;
    });
    if (unknownUnchanged) {
      const note = warning("UNKNOWN_UNCHANGED", "Some unchanged actions referenced extraction-local or unknown IDs. No transition was applied for those actions; verified history is preserved and the current original photo is shown for review.");
      diagnostics.push(note);
      step.evidenceStatus = "UNCERTAIN";
      step.uncertainty = append(step.uncertainty, note);
      step.text = "The current source photograph is preserved; some generated transitions need review.";
    }
    if (((omitted && !retained.length) || unknownUnchanged > 0) && knownIds.has(fallback.imageId)) {
      const usedIds = new Set([...(fallback.everUsedIds || []), ...(fallback.activeElementIds || []), ...retained.flatMap((change) => record(change) && record(change.element) && typeof change.element.id === "string" ? [change.element.id] : [])]);
      const baseId = `source-recovery:photo:${fallback.momentIndex}:${fallback.chunkIndex}`;
      let fallbackId = baseId;
      for (let suffix = 1; usedIds.has(fallbackId); suffix++) fallbackId = `${baseId}:${suffix}`;
      retained.push({ id: `unresolved-source-event-${fallback.momentIndex}-${fallback.chunkIndex}`, action: "ADD", targetId: null, description: "The original source is retained because a generated change lacked verifiable evidence.", element: {
        id: fallbackId, type: "image_crop", semanticLabel: "Original photograph", text: "Original photograph; some generated transitions could not be verified.", latex: null, codeLanguage: null, layout: { x: .05, y: .05, width: .9, height: .9 }, layoutBasis: "AUTO_LAYOUT", sourceImageIds: [fallback.imageId], sourceRegion: null, evidenceStatus: "UNCERTAIN", uncertainty: "Unverified generated transitions were omitted. Inspect this actual source photograph; its additional writing is preserved without inventing a change history.", visual: null,
      } });
    }
    step.changes = retained;
  }
  data.unresolved = unique(diagnostics);
  return data;
}
