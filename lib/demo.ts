import type {
  BoardElement,
  Reconstruction,
  ReconstructionStep,
} from "@/lib/types";
import { linkedListFrames } from "@/lib/demo-scenes.mjs";

export const LINKED_LIST_DEMO_TOPIC = "linked-list-evolution-v2";

export interface DemoElement {
  id: string;
  type: BoardElement["type"];
  text: string;
  latex?: string;
  codeLanguage?: string;
  layout: BoardElement["layout"];
  visual?: BoardElement["visual"];
}
export interface DemoFrame {
  title: string;
  description: string;
  sectionId: string;
  elements: DemoElement[];
  correctionIds?: string[];
  newTopic?: boolean;
}

/** Original source PNGs and replay share author-defined geometry; no vision accuracy is implied. */
export function sampleReconstruction(imageIds: string[]): Reconstruction {
  return sceneReconstruction(
    imageIds,
    linkedListFrames as unknown as DemoFrame[],
  );
}

export function sceneReconstruction(
  imageIds: string[],
  frames: DemoFrame[],
): Reconstruction {
  if (!imageIds.length)
    throw new Error("The synthetic sample needs source images.");
  let previous: DemoElement[] = [];
  const steps: ReconstructionStep[] = frames.map((frame, index) => {
    const imageId = imageIds[Math.min(index, imageIds.length - 1)];
    const beforeId =
      imageIds[Math.max(0, Math.min(index - 1, imageIds.length - 1))];
    const changes: NonNullable<ReconstructionStep["changes"]> = [];
    if (frame.newTopic) {
      changes.push({
        id: `capture-${index + 1}-clear`,
        action: "NEW_TOPIC",
        targetId: null,
        element: null,
        description:
          "The photographed board has been cleared for the cost-of-insertion topic. Earlier captures remain available in replay.",
      });
      previous = [];
    }
    for (const oldElement of previous) {
      if (!frame.elements.some((element) => element.id === oldElement.id)) {
        changes.push({
          id: `capture-${index + 1}-erase-${oldElement.id}`,
          action: "ERASE",
          targetId: oldElement.id,
          element: null,
          description: `${oldElement.text || oldElement.id} is absent from this photographed board.`,
        });
      }
    }
    for (const item of frame.elements) {
      const old = previous.find((element) => element.id === item.id);
      if (old && JSON.stringify(old) === JSON.stringify(item)) {
        changes.push({
          id: `capture-${index + 1}-keep-${item.id}`,
          action: "UNCHANGED",
          targetId: item.id,
          element: null,
          description: `${item.text || item.id} remains visible in the same location.`,
        });
        continue;
      }
      const action = !old
        ? "ADD"
        : frame.correctionIds?.includes(item.id)
          ? "CORRECT"
          : "MODIFY";
      const element: BoardElement = {
        ...item,
        layoutBasis: "SAMPLE_EXACT",
        sourceImageIds: [imageId],
        evidenceStatus: "OBSERVED",
        sourceRegion: { imageId, ...item.layout },
      };
      changes.push({
        id: `capture-${index + 1}-${action.toLowerCase()}-${item.id}`,
        action,
        targetId: old ? item.id : null,
        element,
        description:
          action === "CORRECT"
            ? "The visible draft n->next = nullptr is crossed out and replaced with n->next = head->next; the earlier statement remains in capture 2."
            : `${action === "ADD" ? "Appears" : "Changes"} in capture ${index + 1}: ${item.text || item.id}`,
      });
    }
    previous = frame.elements;
    return {
      id: `capture-${index + 1}`,
      type: "paragraph",
      sectionId: frame.sectionId,
      text: frame.description,
      stepIndex: index,
      sourceImageIds: index
        ? [beforeId, imageId].filter((id, i, ids) => ids.indexOf(id) === i)
        : [imageId],
      evidenceStatus: "OBSERVED",
      originalText: frame.title,
      changes,
      verification: {
        status: "NOT_VERIFIED",
        message:
          "Author-defined synthetic fixture. Coordinates are exact by construction; no live vision accuracy or code execution is claimed.",
      },
    };
  });
  return {
    schemaVersion: 2,
    title: "Linked lists: preserve the pointer, then insert",
    overview:
      "SYNTHETIC SAMPLE — Five original, chronological university board captures combine a linked-list diagram, C++ source code, a visibly corrected statement, pointer rewiring, and a new complexity topic. This is prebuilt sample data, not a live AI response.",
    disciplines: ["Computer science", "Software engineering"],
    board: { aspectRatio: 1.6 },
    concepts: [
      "Linked-list nodes and pointers",
      "Insertion after a known node",
      "Preserving the successor",
      "Visible corrections",
      "Operation complexity",
    ],
    sections: [
      { id: "structure", title: "01 · Nodes and the insertion draft" },
      { id: "rewire", title: "02 · Correct and rewire the pointers" },
      { id: "cost", title: "03 · A new topic: insertion cost" },
    ],
    steps,
    unresolved: [
      "These five images cannot reveal writing or erasures that happened between captures.",
      "The C++ shown is a lecture excerpt; allocation failures, ownership, and deletion are outside the captured content.",
    ],
  };
}
