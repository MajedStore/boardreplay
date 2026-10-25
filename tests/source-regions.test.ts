import { describe, expect, it } from "vitest";
import { normalizeSourceRegion, SOURCE_REGION_TOLERANCE } from "../lib/photos/source-regions";

const box = { x: .1, y: .2, width: .3, height: .4 };

describe("explicit source-region coordinate contract", () => {
  it("keeps valid normalized source bounds and binds a known single photograph", () => {
    const result = normalizeSourceRegion(box, { imageId: "photo-a", allowedImageIds: ["photo-a"] });
    expect(result.region).toMatchObject({ x: .1, y: .2, imageId: "photo-a" });
    expect(result.region?.width).toBeCloseTo(.3);
    expect(result.region?.height).toBeCloseTo(.4);
    expect(result.diagnostics).toEqual([]);
    expect(normalizeSourceRegion({ x: .1, y: .1, width: .6, height: .3 }).region).toEqual({ x: .1, y: .1, width: .6, height: .3 });
    expect(box).toEqual({ x: .1, y: .2, width: .3, height: .4 });
  });

  it.each([undefined, null])("treats missing optional regions as no exact localization: %s", (value) => {
    expect(normalizeSourceRegion(value, { imageId: "photo-a" })).toEqual({ region: null, diagnostics: [] });
  });

  it.each([
    { value: "not a box", code: "INVALID_REGION" },
    { value: [], code: "INVALID_REGION" },
    { value: {}, code: "INVALID_COORDINATES" },
    { value: { ...box, height: undefined }, code: "INVALID_COORDINATES" },
    { value: { ...box, x: "0.1" }, code: "INVALID_COORDINATES" },
    { value: { ...box, x: NaN }, code: "INVALID_COORDINATES" },
    { value: { ...box, y: Infinity }, code: "INVALID_COORDINATES" },
    { value: { ...box, width: 0 }, code: "EMPTY_REGION" },
    { value: { ...box, height: -0.4 }, code: "EMPTY_REGION" },
    { value: { ...box, x: -.3 }, code: "OUT_OF_BOUNDS" },
    { value: { ...box, x: .8 }, code: "OUT_OF_BOUNDS" },
    { value: { ...box, height: 900 }, code: "OUT_OF_BOUNDS" },
  ])("drops only malformed source geometry ($code)", ({ value, code }) => {
    const result = normalizeSourceRegion(value);
    expect(result.region).toBeNull();
    expect(result.diagnostics.map((item) => item.code)).toContain(code);
    expect(result.diagnostics.every((item) => !item.message.includes("not a box"))).toBe(true);
  });

  it("repairs only small boundary rounding errors under a fixed normalized tolerance", () => {
    expect(SOURCE_REGION_TOLERANCE).toBe(1e-4);
    const result = normalizeSourceRegion({ x: -0.00002, y: .5, width: 1.00006, height: .50004 });
    expect(result.region).toEqual({ x: 0, y: .5, width: 1, height: .5 });
    expect(result.diagnostics.map((item) => item.code)).toEqual(["ROUNDING_ADJUSTED"]);
    expect(normalizeSourceRegion({ x: -.00011, y: 0, width: .8, height: .8 }).region).toBeNull();
  });

  it("does not expand a box with no area inside the image into a fake source crop", () => {
    const result = normalizeSourceRegion({ x: 1.00001, y: .2, width: .00001, height: .3 });
    expect(result.region).toBeNull();
    expect(result.diagnostics.map((item) => item.code)).toEqual(["EMPTY_REGION"]);
  });

  it("reorders reversed corners only for an explicit XYXY contract", () => {
    const result = normalizeSourceRegion({ x1: .7, y1: .8, x2: .2, y2: .1 }, { format: "XYXY" });
    expect(result.region).toMatchObject({ x: .2, y: .1 });
    expect(result.region?.width).toBeCloseTo(.5);
    expect(result.region?.height).toBeCloseTo(.7);
    expect(result.diagnostics.map((item) => item.code)).toEqual(["REVERSED_CORNERS"]);
    expect(normalizeSourceRegion({ x: .7, y: .8, width: -.5, height: -.7 }).region).toBeNull();
    expect(normalizeSourceRegion({ x1: .2, y1: .1, x2: .7, y2: .8 }).region).toBeNull();
  });

  it("converts declared 0–1000 coordinates without interpreting normalized-looking ranges", () => {
    const result = normalizeSourceRegion({ x: 100, y: 200, width: 300, height: 400 }, { coordinateSpace: "SCALE_1000" });
    expect(result.region?.x).toBe(.1);
    expect(result.region?.height).toBeCloseTo(.4);
    expect(normalizeSourceRegion({ x: 100, y: 200, width: 300, height: 400 }).region).toBeNull();
    expect(normalizeSourceRegion({ x: 1, y: 1, width: 1, height: 1 }, { coordinateSpace: "SCALE_1000" }).region?.x).toBe(.001);
  });

  it.each([
    [4000, 2000], [2000, 4000], [2200, 1100], [1100, 2200], [512, 512],
    [4032, 3024], [3024, 4032], [800, 1200], [1200, 800],
  ])("uses the exact supplied %i × %i pixel canvas for mixed nine-photo dimensions", (width, height) => {
    const result = normalizeSourceRegion({ x: width * .1, y: height * .2, width: width * .3, height: height * .4 }, { coordinateSpace: "PIXELS", width, height });
    expect(result.region?.x).toBeCloseTo(.1);
    expect(result.region?.y).toBeCloseTo(.2);
    expect(result.region?.width).toBeCloseTo(.3);
    expect(result.region?.height).toBeCloseTo(.4);
  });

  it("requires pixel dimensions and never guesses original versus processing image size", () => {
    expect(normalizeSourceRegion({ x: 220, y: 110, width: 440, height: 220 }, { coordinateSpace: "PIXELS" }).diagnostics[0].code).toBe("MISSING_IMAGE_DIMENSIONS");
    const processing = normalizeSourceRegion({ x: 220, y: 110, width: 440, height: 220 }, { coordinateSpace: "PIXELS", width: 2200, height: 1100 });
    expect(processing.region?.x).toBe(.1);
    expect(processing.region?.y).toBe(.1);
    expect(normalizeSourceRegion({ x: 220, y: 110, width: 440, height: 220 }, { coordinateSpace: "PIXELS", width: 0, height: 1100 }).region).toBeNull();
  });

  it("preserves source identity and never replaces a foreign or missing image reference", () => {
    for (const input of [{ ...box, imageId: "other-photo" }, { ...box, imageId: "" }, { ...box, imageId: 4 }]) {
      const result = normalizeSourceRegion(input, { imageId: "actual-photo", allowedImageIds: ["actual-photo"] });
      expect(result.region).toBeNull();
      expect(result.diagnostics[0].code).toBe("INVALID_IMAGE_REFERENCE");
    }
    expect(normalizeSourceRegion(box, { requireImageId: true }).region).toBeNull();
    expect(normalizeSourceRegion(box, { allowedImageIds: ["actual-photo"] }).region).toBeNull();
    expect(normalizeSourceRegion({ ...box, imageId: "actual-photo" }, { allowedImageIds: ["actual-photo"], requireImageId: true }).region?.imageId).toBe("actual-photo");
  });

  it.each([
    [0, .1, .2, .3, .4], [90, .4, .1, .4, .3],
    [180, .6, .4, .3, .4], [270, .2, .6, .4, .3],
  ] as const)("maps an explicitly declared clockwise %i° frame to the canonical photograph", (rotation, x, y, width, height) => {
    const result = normalizeSourceRegion(box, { transform: { rotation } });
    expect(result.region?.x).toBeCloseTo(x);
    expect(result.region?.y).toBeCloseTo(y);
    expect(result.region?.width).toBeCloseTo(width);
    expect(result.region?.height).toBeCloseTo(height);
  });

  it("maps explicit EXIF mirror/rotation and crop offsets instead of applying orientation twice", () => {
    const identity = normalizeSourceRegion(box);
    expect(identity.region?.x).toBe(.1);
    const mirrored = normalizeSourceRegion(box, { transform: { flipX: true, flipY: true } });
    expect(mirrored.region?.x).toBeCloseTo(.6);
    expect(mirrored.region?.y).toBeCloseTo(.4);
    const mapped = normalizeSourceRegion(box, { transform: { rotation: 90, crop: { x: .2, y: .1, width: .5, height: .6 } } });
    expect(mapped.region?.x).toBeCloseTo(.4);
    expect(mapped.region?.y).toBeCloseTo(.16);
    expect(mapped.region?.width).toBeCloseTo(.2);
    expect(mapped.region?.height).toBeCloseTo(.18);
  });

  it("rejects unsupported transforms without inventing source geometry", () => {
    expect(normalizeSourceRegion(box, { transform: { rotation: 45 as 90 } }).diagnostics[0].code).toBe("INVALID_TRANSFORM");
    expect(normalizeSourceRegion(box, { transform: { crop: { x: .9, y: .1, width: .5, height: .5 } } }).region).toBeNull();
    expect(normalizeSourceRegion(box, { transform: { crop: { x: 0, y: 0, width: NaN, height: 1 } } }).region).toBeNull();
  });
});
