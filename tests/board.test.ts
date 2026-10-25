import { describe, expect, it } from "vitest";
import type { BoardElement, Reconstruction, ReconstructionStep } from "../lib/types";
import {
  getBoardScene,
  normalizeLegacyReconstruction,
} from "../lib/board/scene";
import {
  reconcileMissingSources,
  stampSourceRotations,
  validateReconstruction,
} from "../lib/reconstruction/validate";
import { markUserEdits, updateMomentAnnotation } from "../lib/reconstruction/edits";
function element(id: string, text = id): BoardElement {
  return {
    id,
    type: "shape",
    text,
    layout: { x: 0.1, y: 0.1, width: 0.2, height: 0.1 },
    layoutBasis: "SOURCE_ESTIMATED",
    sourceImageIds: ["first"],
    evidenceStatus: "OBSERVED",
    visual: {
      shape: "rectangle",
      fromId: null,
      toId: null,
      points: [],
      label: text,
    },
  };
}
function fixture(): Reconstruction {
  return {
    schemaVersion: 2,
    title: "Network evolution",
    overview: "A component is connected, corrected and cleared.",
    board: { aspectRatio: 1.6 },
    disciplines: ["Engineering"],
    concepts: [],
    sections: [{ id: "main", title: "System" }],
    unresolved: [],
    steps: [
      {
        id: "first-moment",
        type: "diagram",
        sectionId: "main",
        text: "Two visible components and their connection.",
        stepIndex: 0,
        sourceImageIds: ["first"],
        evidenceStatus: "OBSERVED",
        changes: [
          {
            id: "a",
            action: "ADD",
            targetId: null,
            element: element("source", "Controller"),
            description: "Controller visible",
          },
          {
            id: "b",
            action: "ADD",
            targetId: null,
            element: {
              ...element("sink", "Actuator"),
              layout: { x: 0.6, y: 0.1, width: 0.2, height: 0.1 },
            },
            description: "Actuator visible",
          },
          {
            id: "c",
            action: "ADD",
            targetId: null,
            element: {
              ...element("wire", "signal"),
              type: "arrow",
              visual: {
                shape: "arrow",
                fromId: "source",
                toId: "sink",
                points: [],
                label: "signal",
              },
            },
            description: "Signal arrow visible",
          },
        ],
      },
      {
        id: "second-moment",
        type: "annotation",
        sectionId: "main",
        text: "An annotation is corrected.",
        stepIndex: 1,
        sourceImageIds: ["second"],
        evidenceStatus: "OBSERVED",
        changes: [
          {
            id: "d",
            action: "UNCHANGED",
            targetId: "source",
            element: null,
            description: "Same controller",
          },
          {
            id: "e",
            action: "CORRECT",
            targetId: "sink",
            element: {
              ...element("sink", "Sensor"),
              sourceImageIds: ["second"],
              layout: { x: 0.6, y: 0.1, width: 0.2, height: 0.1 },
            },
            description: "Label visibly corrected to sensor",
          },
        ],
      },
      {
        id: "third-moment",
        type: "paragraph",
        sectionId: "main",
        text: "The board is cleared.",
        stepIndex: 2,
        sourceImageIds: ["third"],
        evidenceStatus: "OBSERVED",
        changes: [
          {
            id: "f",
            action: "ERASE",
            targetId: "wire",
            element: null,
            description: "Connection erased",
          },
          {
            id: "g",
            action: "ERASE",
            targetId: "sink",
            element: null,
            description: "Sensor erased",
          },
          {
            id: "h",
            action: "ERASE",
            targetId: "source",
            element: null,
            description: "Controller erased",
          },
        ],
      },
    ],
  };
}
const ids = ["first", "second", "third"];
describe("spatial chronology engine", () => {
  it("validates grouped photograph chronology without requiring a repeated moment for every duplicate", () => {
    const input = fixture();
    input.steps[0].sourceImageIds.push("first-alternate");
    input.steps[1].sourceImageIds.push("second-alternate");
    const sources = [...ids, "first-alternate", "second-alternate"];
    const options = { requireVisual: true, checkChronology: true, stateImageIds: [["first", "first-alternate"], ["second", "second-alternate"], ["third"]] };
    expect(validateReconstruction(input, sources, options).steps).toHaveLength(3);
    input.steps[0].sourceImageIds.push("second-alternate");
    expect(() => validateReconstruction(input, sources, options)).toThrow(/future photograph/);
  });
  it("requires an explicit boundary for independent sequences and rejects unsupported cross-sequence evidence", () => {
    const input = fixture();
    input.steps = input.steps.slice(0, 2);
    const options = { requireVisual: true, checkChronology: true, stateImageIds: [["first"], ["second"]], sequenceStartIndices: [0, 1] };
    expect(() => validateReconstruction(input, ["first", "second"], options)).toThrow(/sequence/);
    input.steps[1].changes = [{ id: "separate-board", action: "NEW_TOPIC", targetId: null, element: null, description: "Relationship between boards is unknown." }, { id: "new-component", action: "ADD", targetId: null, element: { ...element("independent-component"), sourceImageIds: ["second"] }, description: "A separate board photograph." }];
    const saved = validateReconstruction(input, ["first", "second"], options);
    expect(getBoardScene(saved, 1).elements.map((item) => item.id)).toEqual(["independent-component"]);
    input.steps[1].sourceImageIds.push("first");
    expect(() => validateReconstruction(input, ["first", "second"], options)).toThrow(/unrelated earlier sequence/);
  });
  it("updates a saved personal annotation when its notes are edited again", () => {
    const input = fixture();
    const note: ReconstructionStep = { ...input.steps[0], id: "personal-note", stepIndex: 1, sourceImageIds: [], evidenceStatus: "USER_EDITED", explanation: true, changes: undefined };
    note.changes = updateMomentAnnotation(note, { text: "Remember the successor", latex: null, uncertainty: null });
    const original = JSON.stringify(note);
    const edited = { ...note, changes: updateMomentAnnotation(note, { text: "Save the successor before rewiring", latex: null, uncertainty: "Review ownership separately" }) };
    const history = { ...input, steps: [input.steps[0], edited] };
    expect(getBoardScene(history, 0).elements.some((item) => item.id === "note-personal-note")).toBe(false);
    expect(getBoardScene(history, 1).elements.find((item) => item.id === "note-personal-note")).toMatchObject({ text: "Save the successor before rewiring", uncertainty: "Review ownership separately", evidenceStatus: "USER_EDITED" });
    expect(edited.changes![0].id).toBe(note.changes![0].id);
    expect(JSON.stringify(note)).toBe(original);
  });
  it("keeps photographed events and genuinely blank scenes unchanged when editing a caption", () => {
    const photo = fixture().steps[0];
    const content = { text: "Reviewed lecture caption", latex: null, uncertainty: null };
    expect(updateMomentAnnotation(photo, content)).toBe(photo.changes);
    const blank = { ...photo, changes: [] };
    expect(updateMomentAnnotation(blank, content)).toEqual([]);
    expect(updateMomentAnnotation({ ...photo, changes: undefined }, content)).toBeUndefined();
  });
  it("reconstructs every state deterministically when seeking backward and never mutates history", () => {
    const input = validateReconstruction(fixture(), ids, {
      requireVisual: true,
      checkChronology: true,
    });
    const frozen = JSON.stringify(input);
    expect(getBoardScene(input, 2).elements).toEqual([]);
    expect(getBoardScene(input, 2).removed.map((e) => e.id)).toEqual([
      "wire",
      "sink",
      "source",
    ]);
    expect(
      getBoardScene(input, 0).elements.find((e) => e.id === "sink")?.text,
    ).toBe("Actuator");
    expect(
      getBoardScene(input, 1).elements.find((e) => e.id === "sink")?.text,
    ).toBe("Sensor");
    expect(getBoardScene(input, 1).changedIds).toEqual(["sink"]);
    expect(getBoardScene(input, -1).elements).toEqual([]);
    expect(JSON.stringify(input)).toBe(frozen);
  });
  it("rejects invented references, reused identities, impossible erasures and dangling connections", () => {
    const invented = fixture();
    invented.steps[0].changes![0].element!.sourceImageIds = ["unseen"];
    expect(() => validateReconstruction(invented, ids)).toThrow(/source/);
    const duplicate = fixture();
    duplicate.steps[1].changes!.push({
      ...duplicate.steps[0].changes![0],
      id: "new-id",
    });
    expect(() => validateReconstruction(duplicate, ids)).toThrow(/never-used/);
    const missing = fixture();
    missing.steps[1].changes![0].targetId = "unknown";
    expect(() => validateReconstruction(missing, ids)).toThrow(/active/);
    const dangling = fixture();
    dangling.steps[2].changes!.shift();
    expect(() => validateReconstruction(dangling, ids)).toThrow(/connection/);
  });
  it("requires bounded layout, recovers invalid optional highlights, and refuses automatic uncited elements", () => {
    const overflow = fixture();
    overflow.steps[0].changes![0].element!.layout.x = 0.95;
    expect(() => validateReconstruction(overflow, ids)).toThrow(/outside/);
    const crop = fixture();
    crop.steps[0].changes![0].element!.sourceRegion = {
      imageId: "second",
      x: 0,
      y: 0,
      width: 0.5,
      height: 0.5,
    };
    const recovered = validateReconstruction(crop, ids);
    expect(recovered.steps[0].changes![0].element!.sourceRegion).toBeNull();
    expect(recovered.steps[0].changes![0].element!.sourceImageIds).toEqual(crop.steps[0].changes![0].element!.sourceImageIds);
    expect(recovered.unresolved.join(" ")).toMatch(/Source highlighting/);
    const uncited = fixture();
    uncited.steps[0].changes![0].element!.sourceImageIds = [];
    expect(() =>
      validateReconstruction(uncited, ids, { requireVisual: true }),
    ).toThrow(/photographed evidence/);
    expect(
      validateReconstruction(uncited, ids).steps[0].changes![0].element!
        .evidenceStatus,
    ).toBe("UNCERTAIN");
  });
  it("a clear first frame is an empty scene, and legacy notes get explicitly automatic layouts", () => {
    const blank = fixture();
    blank.steps = [{ ...blank.steps[0], changes: [] }];
    expect(
      getBoardScene(
        validateReconstruction(blank, ["first"], {
          requireVisual: true,
          checkChronology: true,
        }),
        0,
      ).elements,
    ).toEqual([]);
    const legacy = fixture();
    delete legacy.schemaVersion;
    legacy.steps = legacy.steps.map((moment) => {
      const copy = { ...moment };
      delete copy.changes;
      return copy;
    });
    const upgraded = normalizeLegacyReconstruction(legacy);
    expect(getBoardScene(upgraded, 0).elements[0].layoutBasis).toBe(
      "AUTO_LAYOUT",
    );
    expect(legacy.schemaVersion).toBeUndefined();
  });
  it("deleted source images downgrade nested elements and restoration never resurrects false citations", () => {
    const input = fixture();
    input.steps[0].changes![0].element!.sourceRegion = {
      imageId: "first",
      x: 0.1,
      y: 0.1,
      width: 0.2,
      height: 0.1,
    };
    const result = reconcileMissingSources(input, ["second", "third"]);
    const item = result.reconstruction.steps[0].changes![0].element!;
    expect(item.sourceImageIds).toEqual([]);
    expect(item.evidenceStatus).toBe("UNCERTAIN");
    expect(item.sourceRegion).toBeNull();
    expect(result.missingImageIds).toEqual(["first"]);
  });
  it("persists user element changes with provenance while retaining earlier event payloads", () => {
    const original = fixture(),
      edited = structuredClone(original);
    edited.steps[1].changes![1].element!.text = "Student corrected label";
    const next = markUserEdits(edited, original);
    expect(next.steps[1].changes![1].element!.evidenceStatus).toBe(
      "USER_EDITED",
    );
    expect(next.steps[0].changes![1].element!.evidenceStatus).toBe("OBSERVED");
    expect(
      getBoardScene(next, 0).elements.find((e) => e.id === "sink")?.text,
    ).toBe("Actuator");
    expect(
      getBoardScene(next, 1).elements.find((e) => e.id === "sink")?.text,
    ).toBe("Student corrected label");
  });
  it("imports legacy history before correcting an element and retains untouched automatic-layout provenance", () => {
    const legacy = fixture();
    delete legacy.schemaVersion;
    for (const moment of legacy.steps) delete moment.changes;
    const original = JSON.stringify(legacy);
    const editable = structuredClone(normalizeLegacyReconstruction(legacy));
    const observed = getBoardScene(legacy, 0).elements[0];
    editable.steps[1].sourceImageIds = [
      ...editable.steps[1].sourceImageIds,
      ...observed.sourceImageIds,
    ];
    editable.steps[1].changes!.push({
      id: "legacy-user-correction",
      action: "CORRECT",
      targetId: observed.id,
      element: {
        ...observed,
        text: "Corrected imported diagram caption",
        evidenceStatus: "USER_EDITED",
      },
      description: "Caption reviewed against the original photo.",
    });
    const saved = markUserEdits(validateReconstruction(editable, ids), legacy);
    expect(saved.schemaVersion).toBe(2);
    expect(getBoardScene(saved, 0).elements[0].text).toBe(observed.text);
    expect(
      getBoardScene(saved, 1).elements.find((item) => item.id === observed.id),
    ).toMatchObject({
      text: "Corrected imported diagram caption",
      evidenceStatus: "USER_EDITED",
      layoutBasis: "AUTO_LAYOUT",
    });
    expect(saved.steps[0].evidenceStatus).toBe("OBSERVED");
    expect(saved.steps[0].changes![0].element).toMatchObject({
      evidenceStatus: "OBSERVED",
      layoutBasis: "AUTO_LAYOUT",
    });
    expect(saved.steps[1].changes![0].element!.evidenceStatus).toBe("OBSERVED");
    expect(saved.steps[2].evidenceStatus).toBe("OBSERVED");
    expect(JSON.stringify(legacy)).toBe(original);
  });
  it("can erase an imported legacy element without changing its earlier captured state", () => {
    const legacy = fixture();
    delete legacy.schemaVersion;
    for (const moment of legacy.steps) delete moment.changes;
    const editable = structuredClone(normalizeLegacyReconstruction(legacy));
    const importedId = getBoardScene(legacy, 0).elements[0].id;
    editable.steps[2].changes!.push({
      id: "legacy-user-erasure",
      action: "ERASE",
      targetId: importedId,
      element: null,
      description: "User removed this imported note.",
    });
    const saved = markUserEdits(validateReconstruction(editable, ids), legacy);
    expect(
      getBoardScene(saved, 0).elements.some((item) => item.id === importedId),
    ).toBe(true);
    expect(
      getBoardScene(saved, 2).elements.some((item) => item.id === importedId),
    ).toBe(false);
    expect(saved.steps[0].changes![0].element!.evidenceStatus).toBe("OBSERVED");
    expect(legacy.steps.every((moment) => moment.changes === undefined)).toBe(true);
  });
  it("freezes prepared-image rotation and aspect for exact same crop after image metadata changes", () => {
    const input = fixture();
    input.steps[0].changes![0].element!.sourceRegion = {
      imageId: "first",
      x: 0.1,
      y: 0.1,
      width: 0.2,
      height: 0.1,
    };
    const stamped = stampSourceRotations(input, [
      { id: "first", rotation: 90, preparedAspectRatio: 0.75 },
    ]);
    expect(stamped.steps[0].changes![0].element!.sourceRegion).toMatchObject({
      rotation: 90,
      imageAspectRatio: 0.75,
    });
    expect(
      input.steps[0].changes![0].element!.sourceRegion!.rotation,
    ).toBeUndefined();
  });
  it.each([
    { x: -0.5, y: 0.1, width: 0.3, height: 0.2 },
    { x: 0.9, y: 0.1, width: 0.3, height: 0.2 },
    { x: 0.1, y: 0.1, width: 0, height: 0.2 },
    { x: 200, y: 100, width: 300, height: 100 },
    { x: NaN, y: 0.1, width: 0.3, height: 0.2 },
    { x: 0.1, y: 0.1, height: 0.2 },
  ])("drops only an invalid persisted optional region: %j", (bounds) => {
    const input = fixture();
    const element = input.steps[0].changes![0].element!;
    const raw = { ...input, steps: input.steps.map((step, index) => index ? step : { ...step, changes: [{ ...step.changes![0], element: { ...element, sourceRegion: { imageId: "first", ...bounds } } }, ...step.changes!.slice(1)] }) };
    const result = validateReconstruction(raw, ids);
    expect(result.steps[0].changes![0].element).toMatchObject({ id: element.id, text: element.text, sourceImageIds: element.sourceImageIds, sourceRegion: null });
    expect(result.unresolved.join(" ")).toMatch(/Source highlighting/);
  });
  it("corrects small highlight boundary rounding without changing content or mutating input", () => {
    const input = fixture();
    const element = input.steps[0].changes![0].element!;
    element.sourceRegion = { imageId: "first", x: 0.8, y: 0.1, width: 0.20001, height: 0.2 };
    const result = validateReconstruction(input, ids);
    expect(result.steps[0].changes![0].element!.sourceRegion!.width).toBeCloseTo(0.2);
    expect(element.sourceRegion.width).toBe(0.20001);
    expect(result.steps[0].changes![0].element!.text).toBe(element.text);
  });
  it("freezes a complete source view without inventing a missing highlight", () => {
    const input = fixture();
    const element = input.steps[0].changes![0].element!;
    element.type = "image_crop";
    element.sourceRegion = null;
    const stamped = stampSourceRotations(input, [{ id: "first", rotation: 270, preparedAspectRatio: 0.6 }]);
    expect(stamped.steps[0].changes![0].element!.sourceRegion).toBeNull();
    expect(stamped.steps[0].changes![0].element!.sourceView).toEqual({ imageId: "first", rotation: 270, imageAspectRatio: 0.6 });
    expect(element.sourceView).toBeUndefined();
    expect(validateReconstruction(stamped, ids).steps[0].changes![0].element!.sourceView).toEqual({ imageId: "first", rotation: 270, imageAspectRatio: 0.6 });
  });
});
