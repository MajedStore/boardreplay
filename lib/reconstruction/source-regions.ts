import { normalizeSourceRegion } from "../photos/source-regions";

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Localize faults to optional highlights before the persisted content schema is checked. */
export function recoverReconstructionRegions(value: unknown, imageIds: readonly string[]): unknown {
  const recovered: unknown = structuredClone(value);
  if (!object(recovered) || !Array.isArray(recovered.steps)) return recovered;
  const warnings: string[] = [];
  for (const moment of recovered.steps) {
    if (!object(moment) || !Array.isArray(moment.changes)) continue;
    for (const change of moment.changes) {
      if (!object(change) || !object(change.element)) continue;
      const element = change.element;
      if (element.sourceRegion === undefined || element.sourceRegion === null) continue;
      const raw = element.sourceRegion;
      const citations = Array.isArray(element.sourceImageIds)
        ? element.sourceImageIds.filter((id): id is string => typeof id === "string" && imageIds.includes(id)) : [];
      const result = normalizeSourceRegion(raw, { requireImageId: true, allowedImageIds: citations, coordinateSpace: "NORMALIZED", format: "XYWH" });
      element.sourceRegion = result.region;
      if (result.region && object(raw)) {
        // Orientation metadata is server-stamped; malformed metadata cannot turn a valid box into a fatal error.
        if ([0, 90, 180, 270].includes(raw.rotation as number)) Object.assign(result.region, { rotation: raw.rotation });
        if (typeof raw.imageAspectRatio === "number" && Number.isFinite(raw.imageAspectRatio) && raw.imageAspectRatio > 0 && raw.imageAspectRatio <= 1000) Object.assign(result.region, { imageAspectRatio: raw.imageAspectRatio });
      }
      for (const diagnostic of result.diagnostics) {
        const warning = `Source highlighting: ${diagnostic.code}. ${diagnostic.message}`;
        const previous = typeof element.uncertainty === "string" ? element.uncertainty : "";
        if (!previous.includes(warning)) element.uncertainty = [previous, warning].filter(Boolean).join(" ").slice(0, 4000);
        warnings.push(warning);
      }
    }
  }
  if (Array.isArray(recovered.unresolved)) recovered.unresolved = [...new Set([...recovered.unresolved, ...warnings])];
  return recovered;
}
