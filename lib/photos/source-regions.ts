/**
 * Source geometry uses the complete, oriented photograph as a unit square.
 * A provider adapter must explicitly declare any other units or transforms.
 */
export const SOURCE_REGION_TOLERANCE = 1e-4;

export interface NormalizedSourceRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  imageId?: string;
}

export interface SourceRegionDiagnostic {
  code: string;
  message: string;
}

export interface SourceRegionContext {
  /** Known single-photo extraction binding, not a substitute for a foreign ID. */
  imageId?: string;
  allowedImageIds?: readonly string[];
  requireImageId?: boolean;
  /** The exact input canvas dimensions, required only for PIXELS. */
  width?: number;
  height?: number;
  coordinateSpace?: "NORMALIZED" | "PIXELS" | "SCALE_1000";
  /** XYXY explicitly uses x1/y1/x2/y2; XYWH uses x/y/width/height. */
  format?: "XYWH" | "XYXY";
  /** Maps the input unit square to the canonical complete oriented photograph. */
  transform?: {
    flipX?: boolean;
    flipY?: boolean;
    /** Clockwise rotation from the input canvas into source coordinates. */
    rotation?: 0 | 90 | 180 | 270;
    /** Crop in canonical normalized source coordinates, after flips/rotation. */
    crop?: { x: number; y: number; width: number; height: number };
  };
}

export interface SourceRegionResult {
  region: NormalizedSourceRegion | null;
  diagnostics: SourceRegionDiagnostic[];
}

type Corners = { left: number; top: number; right: number; bottom: number };
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * Normalize an optional source box without discarding its surrounding content.
 * No unit system, image identity, or crop is inferred from numeric magnitudes.
 * A null region is a recoverable lack of localization; the caller retains the
 * verified source ID/content and attaches these bounded diagnostics as needed.
 */
export function normalizeSourceRegion(value: unknown, context: SourceRegionContext = {}): SourceRegionResult {
  const diagnostics: SourceRegionDiagnostic[] = [];
  const warn = (code: string, message: string) => diagnostics.push({ code, message });
  const fail = (code: string, message: string): SourceRegionResult => {
    warn(code, message);
    return { region: null, diagnostics };
  };
  if (value === undefined || value === null) return { region: null, diagnostics };
  if (typeof value !== "object" || Array.isArray(value))
    return fail("INVALID_REGION", "Exact source highlighting is unavailable because the source region is malformed.");
  const input = value as Record<string, unknown>;

  let imageId: string | undefined;
  if (input.imageId !== undefined) {
    if (typeof input.imageId !== "string" || !input.imageId.trim())
      return fail("INVALID_IMAGE_REFERENCE", "The source region has no verifiable photograph reference.");
    imageId = input.imageId;
    if (context.imageId !== undefined && imageId !== context.imageId)
      return fail("INVALID_IMAGE_REFERENCE", "The source region refers to a different photograph than the analyzed source.");
  } else if (context.imageId !== undefined) imageId = context.imageId;
  if ((context.requireImageId || context.allowedImageIds !== undefined) && !imageId)
    return fail("INVALID_IMAGE_REFERENCE", "The source region has no verifiable photograph reference.");
  if (imageId !== undefined && (!imageId.trim() || (context.allowedImageIds !== undefined && !context.allowedImageIds.includes(imageId))))
    return fail("INVALID_IMAGE_REFERENCE", "The source region refers to a photograph outside its verified sources.");

  const space = context.coordinateSpace ?? "NORMALIZED";
  const format = context.format ?? "XYWH";
  if (!["NORMALIZED", "PIXELS", "SCALE_1000"].includes(space) || !["XYWH", "XYXY"].includes(format))
    return fail("INVALID_COORDINATE_CONTRACT", "The source coordinate contract is unsupported; no coordinates were guessed.");
  let divisorX = 1, divisorY = 1;
  if (space === "PIXELS") {
    if (!finite(context.width) || !finite(context.height) || context.width <= 0 || context.height <= 0)
      return fail("MISSING_IMAGE_DIMENSIONS", "Pixel source regions require the exact supplied image dimensions.");
    divisorX = context.width;
    divisorY = context.height;
  } else if (space === "SCALE_1000") divisorX = divisorY = 1000;

  let corners: Corners;
  let originalSize: { width: number; height: number } | undefined;
  if (format === "XYXY") {
    const { x1, y1, x2, y2 } = input;
    if (![x1, y1, x2, y2].every(finite))
      return fail("INVALID_COORDINATES", "Source region coordinates must all be present and finite numbers.");
    const firstX = x1 as number, firstY = y1 as number, secondX = x2 as number, secondY = y2 as number;
    if (firstX > secondX || firstY > secondY)
      warn("REVERSED_CORNERS", "Reversed source-region corners were reordered under the explicit corner-coordinate contract.");
    corners = { left: Math.min(firstX, secondX) / divisorX, top: Math.min(firstY, secondY) / divisorY, right: Math.max(firstX, secondX) / divisorX, bottom: Math.max(firstY, secondY) / divisorY };
  } else {
    const { x, y, width, height } = input;
    if (![x, y, width, height].every(finite))
      return fail("INVALID_COORDINATES", "Source region coordinates must all be present and finite numbers.");
    const left = (x as number) / divisorX, top = (y as number) / divisorY;
    const normalizedWidth = (width as number) / divisorX, normalizedHeight = (height as number) / divisorY;
    if (normalizedWidth <= 0 || normalizedHeight <= 0)
      return fail("EMPTY_REGION", "Exact source highlighting is unavailable because the source region has no positive area.");
    corners = { left, top, right: left + normalizedWidth, bottom: top + normalizedHeight };
    originalSize = { width: normalizedWidth, height: normalizedHeight };
  }

  function bounded(candidate: Corners): Corners | null {
    const values = Object.values(candidate);
    if (!values.every(finite)) {
      warn("INVALID_COORDINATES", "Source region coordinates must all be finite numbers.");
      return null;
    }
    if (candidate.left >= candidate.right || candidate.top >= candidate.bottom) {
      warn("EMPTY_REGION", "Exact source highlighting is unavailable because the source region has no positive area.");
      return null;
    }
    if (values.some((number) => number < -SOURCE_REGION_TOLERANCE || number > 1 + SOURCE_REGION_TOLERANCE)) {
      warn("OUT_OF_BOUNDS", "Exact source highlighting is unavailable because the source region lies outside the photograph.");
      return null;
    }
    const clip = (number: number) => Math.max(0, Math.min(1, number));
    const corrected = { left: clip(candidate.left), top: clip(candidate.top), right: clip(candidate.right), bottom: clip(candidate.bottom) };
    if (corrected.left >= corrected.right || corrected.top >= corrected.bottom) {
      warn("EMPTY_REGION", "Exact source highlighting is unavailable because the source region has no positive area within the photograph.");
      return null;
    }
    if (values.some((number, index) => number !== Object.values(corrected)[index]))
      warn("ROUNDING_ADJUSTED", "A source-region boundary was adjusted within the documented rounding tolerance.");
    return corrected;
  }

  const valid = bounded(corners);
  if (!valid) return { region: null, diagnostics };
  corners = valid;
  const transform = context.transform;
  if (transform) {
    const rotation = transform.rotation ?? 0;
    if (![0, 90, 180, 270].includes(rotation) || (transform.flipX !== undefined && typeof transform.flipX !== "boolean") || (transform.flipY !== undefined && typeof transform.flipY !== "boolean"))
      return fail("INVALID_TRANSFORM", "The source-image transform is unsupported; no orientation was guessed.");
    let crop = { left: 0, top: 0, right: 1, bottom: 1 };
    if (transform.crop) {
      const { x, y, width, height } = transform.crop;
      if (![x, y, width, height].every(finite) || width <= 0 || height <= 0)
        return fail("INVALID_TRANSFORM", "The declared source crop is invalid; no image offset was guessed.");
      const validatedCrop = bounded({ left: x, top: y, right: x + width, bottom: y + height });
      if (!validatedCrop) return fail("INVALID_TRANSFORM", "The declared source crop lies outside the canonical photograph.");
      crop = validatedCrop;
    }
    const points = [
      [corners.left, corners.top], [corners.right, corners.top],
      [corners.left, corners.bottom], [corners.right, corners.bottom],
    ].map(([pointX, pointY]) => {
      const x = transform.flipX ? 1 - pointX : pointX;
      const y = transform.flipY ? 1 - pointY : pointY;
      const [rotatedX, rotatedY] = rotation === 90 ? [1 - y, x] : rotation === 180 ? [1 - x, 1 - y] : rotation === 270 ? [y, 1 - x] : [x, y];
      return [crop.left + rotatedX * (crop.right - crop.left), crop.top + rotatedY * (crop.bottom - crop.top)];
    });
    const transformed = bounded({ left: Math.min(...points.map(([x]) => x)), top: Math.min(...points.map(([, y]) => y)), right: Math.max(...points.map(([x]) => x)), bottom: Math.max(...points.map(([, y]) => y)) });
    if (!transformed) return { region: null, diagnostics };
    corners = transformed;
  }
  return {
    region: {
      x: corners.left, y: corners.top,
      // Preserve valid XYWH values verbatim: optional recovery must not alter
      // accepted source geometry merely through floating-point subtraction.
      width: originalSize && !transform && !diagnostics.some((item) => item.code === "ROUNDING_ADJUSTED") ? originalSize.width : corners.right - corners.left,
      height: originalSize && !transform && !diagnostics.some((item) => item.code === "ROUNDING_ADJUSTED") ? originalSize.height : corners.bottom - corners.top,
      ...(imageId !== undefined ? { imageId } : {}),
    },
    diagnostics,
  };
}
