import type {
  BoardChange,
  BoardElement,
  Reconstruction,
  ReconstructionStep,
} from "../types";

export interface BoardScene {
  elements: BoardElement[];
  changedIds: string[];
  removed: BoardElement[];
  changes: BoardChange[];
  topic: string;
}
/** Old text notes stay readable without pretending their placement came from photographs. */
export function normalizeLegacyReconstruction(
  value: Reconstruction,
): Reconstruction {
  if (
    value.schemaVersion === 2 &&
    value.steps.every((moment) => Array.isArray(moment.changes))
  )
    return value;
  const columns = value.steps.length > 1 ? 2 : 1,
    rows = Math.ceil(value.steps.length / columns);
  const steps = value.steps.map((moment, index) => {
    if (Array.isArray(moment.changes)) return moment;
    const diagram = [
      "diagram",
      "uml",
      "circuit",
      "flowchart",
      "graph",
      "drawing",
      "image_crop",
    ].includes(moment.type);
    const element: BoardElement = {
      id: `legacy-${moment.id}`,
      type: diagram ? "image_crop" : moment.type,
      text: moment.text,
      latex: moment.latex,
      layout: {
        x: 0.05 + (index % columns) * 0.47,
        y: 0.05 + Math.floor(index / columns) * (0.9 / rows),
        width: columns === 1 ? 0.9 : 0.43,
        height: 0.85 / rows,
      },
      layoutBasis: "AUTO_LAYOUT",
      sourceImageIds: moment.sourceImageIds,
      evidenceStatus: moment.evidenceStatus,
      uncertainty: moment.uncertainty,
      sourceRegion: null,
      visual: null,
      semanticLabel: diagram
        ? "Original visual — no inferred geometry"
        : "Imported note",
    };
    // Legacy notes have no photographed position or temporal edit identity. Give each a separate panel.
    return {
      ...moment,
      changes: [
        {
          id: `legacy-change-${moment.id}`,
          action: "ADD" as const,
          targetId: null,
          element,
          description:
            "Imported note; spatial placement is an automatic reading layout.",
        },
      ],
    };
  });
  return {
    ...value,
    schemaVersion: 2,
    board: value.board ?? { aspectRatio: 1.6 },
    disciplines: value.disciplines ?? [],
    steps,
  };
}

/** Pure event reducer: seeking always reconstructs from immutable history, never mutates it. */
export function getBoardScene(
  input: Reconstruction,
  currentIndex: number,
): BoardScene {
  const reconstruction = normalizeLegacyReconstruction(input);
  const elements = new Map<string, BoardElement>();
  const changed = new Set<string>();
  const removed: BoardElement[] = [];
  let topic = reconstruction.title;
  const index = Math.min(
    reconstruction.steps.length - 1,
    Math.max(-1, currentIndex),
  );
  for (let position = 0; position <= index; position++) {
    const moment = reconstruction.steps[position];
    const active = position === index;
    if (active) changed.clear();
    for (const change of moment.changes ?? []) {
      if (change.action === "NEW_TOPIC") {
        if (active) removed.push(...elements.values());
        elements.clear();
        topic = change.description || moment.text;
        continue;
      }
      if (change.action === "ERASE") {
        const before = elements.get(change.targetId ?? "");
        if (active && before) removed.push(before);
        elements.delete(change.targetId ?? "");
        continue;
      }
      if (change.action === "UNCHANGED") continue;
      if (change.element) {
        elements.set(change.element.id, change.element);
        if (active) changed.add(change.element.id);
      }
    }
  }
  return {
    elements: [...elements.values()],
    changedIds: [...changed],
    removed,
    changes: index >= 0 ? (reconstruction.steps[index].changes ?? []) : [],
    topic,
  };
}

export function momentSources(moment: ReconstructionStep): string[] {
  return [
    ...new Set([
      ...moment.sourceImageIds,
      ...(moment.changes ?? []).flatMap(
        (change) => change.element?.sourceImageIds ?? [],
      ),
    ]),
  ];
}

/** A source region is expressed in the same oriented JPEG pixels sent to the provider. */
export function preparedSourceUrl(imageId: string, rotation = 0) {
  return `/api/images/${encodeURIComponent(imageId)}/prepared?rotation=${rotation}`;
}
