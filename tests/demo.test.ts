import { describe, expect, it } from "vitest";
import { sampleReconstruction, type DemoFrame } from "../lib/demo";
import {
  advancedMathReconstruction,
  engineeringCircuitReconstruction,
  textTableReconstruction,
} from "../lib/demo-examples";
import { linkedListFrames } from "../lib/demo-scenes.mjs";
import { getBoardScene } from "../lib/board/scene";
import { validateReconstruction } from "../lib/reconstruction/validate";

describe("original chronological demonstration fixtures", () => {
  it("validates all six actions and exactly reproduces each authored source scene", () => {
    const ids = ["one", "two", "three", "four", "five"];
    const reconstruction = validateReconstruction(
      sampleReconstruction(ids),
      ids,
      { requireVisual: true, checkChronology: true },
    );
    expect(
      new Set(
        reconstruction.steps.flatMap((step) =>
          step.changes!.map((change) => change.action),
        ),
      ),
    ).toEqual(
      new Set(["ADD", "UNCHANGED", "MODIFY", "ERASE", "CORRECT", "NEW_TOPIC"]),
    );
    const sourceFrames = linkedListFrames as unknown as DemoFrame[];
    for (let index = 0; index < sourceFrames.length; index++) {
      const actual = getBoardScene(reconstruction, index).elements;
      const source = sourceFrames[index].elements;
      expect(actual.map((element) => element.id).sort()).toEqual(
        source.map((element) => element.id).sort(),
      );
      for (const expected of source) {
        expect(
          actual.find((element) => element.id === expected.id),
        ).toMatchObject({
          text: expected.text,
          layout: expected.layout,
          ...(expected.visual ? { visual: expected.visual } : {}),
        });
      }
    }
    expect(
      getBoardScene(reconstruction, 1).elements.find(
        (element) => element.id === "insert-code",
      )?.text,
    ).toContain("n->next = nullptr;");
    expect(
      getBoardScene(reconstruction, 2).elements.find(
        (element) => element.id === "insert-code",
      )?.text,
    ).toContain("n->next = head->next;");
    expect(
      getBoardScene(reconstruction, 3).elements.find(
        (element) => element.id === "10-30",
      ),
    ).toBeUndefined();
    expect(
      getBoardScene(reconstruction, 0).elements.find(
        (element) => element.id === "10-30",
      ),
    ).toBeDefined();
  });

  it.each([
    ["engineering diagram", engineeringCircuitReconstruction, "image_crop"],
    ["advanced mathematics", advancedMathReconstruction, "equation"],
    ["text and table", textTableReconstruction, "table"],
  ] as const)(
    "validates the functional %s example with source evidence",
    (_name, fixture, contentType) => {
      const ids = ["photo-a", "photo-b"];
      const reconstruction = validateReconstruction(fixture(ids), ids, {
        requireVisual: true,
        checkChronology: true,
      });
      expect(
        getBoardScene(reconstruction, 1).elements.some(
          (element) => element.type === contentType,
        ),
      ).toBe(true);
      for (const step of reconstruction.steps)
        for (const change of step.changes!) {
          if (change.element)
            expect(
              change.element.sourceImageIds.every((id) =>
                step.sourceImageIds.includes(id),
              ),
            ).toBe(true);
        }
    },
  );
});
