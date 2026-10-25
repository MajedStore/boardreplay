// Original source images and reconstruction share normalized 1280 × 800 geometry.
const box = (id, type, text, x, y, width, height, extra = {}) => ({
  id,
  type,
  text,
  layout: { x, y, width, height },
  ...extra,
});
const node = (id, text, x, y) =>
  box(id, "diagram", text, x, y, 0.14, 0.1, {
    visual: {
      shape: "rectangle",
      fromId: null,
      toId: null,
      points: [],
      label: text,
    },
  });
const arrow = (id, fromId, toId, points) => {
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  return box(
    id,
    "arrow",
    "",
    Math.min(...xs),
    Math.min(...ys),
    Math.max(0.006, Math.max(...xs) - Math.min(...xs)),
    Math.max(0.006, Math.max(...ys) - Math.min(...ys)),
    { visual: { shape: "arrow", fromId, toId, points, label: "" } },
  );
};
const title = box(
  "title",
  "heading",
  "Linked lists: insert after head",
  0.06,
  0.07,
  0.88,
  0.08,
);
const head = box("head", "annotation", "head", 0.06, 0.23, 0.09, 0.06);
const ten = node("node-10", "10 | next", 0.24, 0.22);
const thirty = node("node-30", "30 | next", 0.66, 0.22);
const nil = box("null", "annotation", "nullptr", 0.88, 0.24, 0.1, 0.06);
const headArrow = arrow("head-10", "head", "node-10", [
  { x: 0.15, y: 0.27 },
  { x: 0.24, y: 0.27 },
]);
const originalLink = arrow("10-30", "node-10", "node-30", [
  { x: 0.38, y: 0.27 },
  { x: 0.66, y: 0.27 },
]);
const nullArrow = arrow("30-null", "node-30", "null", [
  { x: 0.8, y: 0.27 },
  { x: 0.88, y: 0.27 },
]);
const structure = box(
  "node-struct",
  "code",
  "struct Node {\n  int value;\n  Node* next;\n};",
  0.06,
  0.52,
  0.39,
  0.23,
  { codeLanguage: "cpp" },
);
const original = [
  title,
  head,
  ten,
  thirty,
  nil,
  headArrow,
  originalLink,
  nullArrow,
  structure,
];
const twentyDraft = node("node-20", "20 | next", 0.45, 0.38);
const n = box("n", "annotation", "n", 0.32, 0.4, 0.06, 0.06);
const nArrow = arrow("n-20", "n", "node-20", [
  { x: 0.38, y: 0.43 },
  { x: 0.45, y: 0.43 },
]);
const wrongCode = box(
  "insert-code",
  "code",
  "Node* n = new Node{20, nullptr};\nn->next = nullptr;\n// next: link head to n",
  0.53,
  0.52,
  0.43,
  0.23,
  { codeLanguage: "cpp" },
);
const reminder = box(
  "temporary-note",
  "annotation",
  "Draft: save the successor before changing head->next.",
  0.06,
  0.83,
  0.88,
  0.06,
);
const draft = [...original, twentyDraft, n, nArrow, wrongCode, reminder];
const correctedCode = {
  ...wrongCode,
  text: "Node* n = new Node{20, nullptr};\nn->next = head->next;\n// next: head->next = n;",
};
const successor = arrow("20-30", "node-20", "node-30", [
  { x: 0.59, y: 0.43 },
  { x: 0.63, y: 0.43 },
  { x: 0.66, y: 0.32 },
]);
const crossedOut = box(
  "crossed-out-statement",
  "annotation",
  "n->next = nullptr;",
  0.53,
  0.78,
  0.27,
  0.05,
);
const strike = box("correction-strike", "shape", "", 0.53, 0.795, 0.27, 0.004, {
  visual: {
    shape: "line",
    fromId: null,
    toId: null,
    points: [
      { x: 0.53, y: 0.8 },
      { x: 0.8, y: 0.8 },
    ],
    label: "",
  },
});
const correction = box(
  "correction-note",
  "annotation",
  "Correction: preserve the old successor.",
  0.53,
  0.87,
  0.43,
  0.06,
);
const corrected = [
  ...original,
  twentyDraft,
  n,
  nArrow,
  correctedCode,
  reminder,
  successor,
  crossedOut,
  strike,
  correction,
];
const twentyFinal = {
  ...twentyDraft,
  layout: { ...twentyDraft.layout, y: 0.22 },
};
const finalSuccessor = arrow("20-30", "node-20", "node-30", [
  { x: 0.59, y: 0.27 },
  { x: 0.66, y: 0.27 },
]);
const newLink = arrow("10-20", "node-10", "node-20", [
  { x: 0.38, y: 0.27 },
  { x: 0.45, y: 0.27 },
]);
const finalCode = {
  ...correctedCode,
  text: "Node* n = new Node{20, nullptr};\nn->next = head->next;\nhead->next = n;",
};
const finalNote = box(
  "final-note",
  "annotation",
  "Final: 10 -> 20 -> 30 -> nullptr",
  0.06,
  0.83,
  0.88,
  0.06,
);
const final = [
  ...original.filter((e) => e.id !== "10-30"),
  twentyFinal,
  newLink,
  finalSuccessor,
  finalCode,
  finalNote,
];
const finalDiagram = final
  .filter(
    (e) =>
      !["title", "node-struct", "insert-code", "final-note"].includes(e.id),
  )
  .map((e) => ({
    ...e,
    id: `cost-${e.id}`,
    visual: e.visual
      ? {
          ...e.visual,
          fromId: e.visual.fromId ? `cost-${e.visual.fromId}` : null,
          toId: e.visual.toId ? `cost-${e.visual.toId}` : null,
        }
      : undefined,
  }));
const costs = [
  box("cost-title", "heading", "Cost of insertion", 0.06, 0.07, 0.88, 0.08),
  ...finalDiagram,
  box(
    "complexity-table",
    "table",
    "| Operation | Cost | Condition |\n| --- | --- | --- |\n| Find position | O(n) | Traverse the list |\n| Insert node | O(1) | Position already known |",
    0.06,
    0.47,
    0.88,
    0.28,
  ),
  box(
    "cost-note",
    "annotation",
    "Finding the insertion point and changing pointers are separate operations.",
    0.06,
    0.83,
    0.88,
    0.06,
  ),
];
export const linkedListFrames = [
  {
    title: "01 / Nodes and pointers",
    sectionId: "structure",
    description:
      "The first board shows head pointing to node 10, node 10 pointing to node 30, and the Node structure in C++.",
    elements: original,
  },
  {
    title: "02 / A new node and an incorrect draft",
    sectionId: "structure",
    description:
      "A node containing 20 and an insertion draft appear. The observed draft says n->next = nullptr; it has not yet been corrected.",
    elements: draft,
  },
  {
    title: "03 / Correct the successor pointer",
    sectionId: "rewire",
    description:
      "The draft is visibly crossed out and corrected to n->next = head->next. Node 20 now points to node 30; the original 10-to-30 connection is still present.",
    elements: corrected,
    correctionIds: ["insert-code"],
  },
  {
    title: "04 / Rewire and complete insertion",
    sectionId: "rewire",
    description:
      "The old 10-to-30 arrow and temporary annotations are erased. The code adds head->next = n, and the final diagram becomes 10 -> 20 -> 30 -> nullptr.",
    elements: final,
  },
  {
    title: "05 / A cleared board and a new topic",
    sectionId: "cost",
    description:
      "The board is cleared for the insertion-cost topic. The final list is redrawn above a table separating traversal O(n) from insertion O(1) when the position is already known.",
    elements: costs,
    newTopic: true,
  },
];

const circuitCrop = box(
  "rc-circuit",
  "image_crop",
  "RC charging circuit — preserve the original source region",
  0.06,
  0.23,
  0.58,
  0.43,
);
const circuitTitle = box(
  "rc-title",
  "heading",
  "RC circuit: charging a capacitor",
  0.06,
  0.07,
  0.88,
  0.08,
);
const circuitValues = box(
  "rc-values",
  "paragraph",
  "R = 1 kΩ\nC = 100 μF\nVs = 5 V",
  0.7,
  0.24,
  0.24,
  0.25,
);
const circuitDrawing = `<g fill="none" stroke="#245675" stroke-width="4"><path d="M115 390V245H245l12-17 18 34 18-34 18 34 18-34 18 34 13-17H590V348M590 376V500H115V420"/><path d="M550 348H630M550 376H630M88 390H142M100 420H130"/></g><g font-family="Arial,sans-serif" font-size="26" fill="#203a4b"><text x="263" y="208">R</text><text x="648" y="370">C</text><text x="135" y="420">Vs</text><text x="372" y="474">i(t)</text></g><path d="M340 495H422" stroke="#245675" stroke-width="3" marker-end="url(#arrowhead)"/>`;
const spectralTitle = box(
  "spectral-title",
  "heading",
  "Spectral theorem: real symmetric matrices",
  0.06,
  0.07,
  0.88,
  0.08,
);
const spectralAssumption = box(
  "symmetric-assumption",
  "paragraph",
  "A is a real symmetric n × n matrix.\nChoose an orthonormal basis of eigenvectors.",
  0.06,
  0.22,
  0.88,
  0.15,
);
const spectralEquation = box(
  "spectral-equation",
  "equation",
  "A = Q Λ Qᵀ",
  0.09,
  0.43,
  0.82,
  0.12,
  { latex: "A = Q\\Lambda Q^{\\mathsf T}" },
);
const spectralDetails = box(
  "spectral-details",
  "paragraph",
  "QᵀQ = I\nΛ = diag(λ₁, …, λₙ)",
  0.09,
  0.64,
  0.82,
  0.16,
);
const spectralSum = box(
  "spectral-sum",
  "equation",
  "A = Σᵢ λᵢ qᵢ qᵢᵀ",
  0.09,
  0.64,
  0.82,
  0.16,
  { latex: "A=\\sum_{i=1}^{n}\\lambda_i q_iq_i^{\\mathsf T}" },
);
const economicsTitle = box(
  "economics-title",
  "heading",
  "Economics: output and price level",
  0.06,
  0.07,
  0.88,
  0.08,
);
const economicsText = box(
  "economics-text",
  "paragraph",
  "Nominal output uses current prices.\nReal output uses the base-year price level.",
  0.06,
  0.22,
  0.88,
  0.17,
);
const economicsTable = box(
  "economics-table",
  "table",
  "| Year | Nominal GDP | Price index |\n| --- | --- | --- |\n| 2024 | 120 | 100 |",
  0.06,
  0.47,
  0.88,
  0.26,
);
const economicsExtended = {
  ...economicsTable,
  text: "| Year | Nominal GDP | Price index |\n| --- | --- | --- |\n| 2024 | 120 | 100 |\n| 2025 | 150 | 125 |",
};
export const disciplineFrames = {
  circuit: [
    {
      title: "01 / Original circuit region",
      sectionId: "lecture",
      description:
        "The captured board contains a resistor, capacitor, voltage source, current arrow, and component values. Preserve the original circuit region rather than infer editable wiring.",
      elements: [circuitTitle, circuitCrop, circuitValues],
      sourceSvg: circuitDrawing,
    },
    {
      title: "02 / Add the time constant",
      sectionId: "lecture",
      description:
        "The circuit remains visible. A time-constant calculation appears below it.",
      elements: [
        circuitTitle,
        circuitCrop,
        circuitValues,
        box("rc-time", "equation", "τ = RC = 0.1 s", 0.06, 0.75, 0.88, 0.1, {
          latex: "\\tau=RC=0.1\\,\\mathrm{s}",
        }),
      ],
      sourceSvg: circuitDrawing,
    },
  ],
  "advanced-math": [
    {
      title: "01 / A symmetric matrix and its basis",
      sectionId: "lecture",
      description:
        "The board states the real-symmetric assumption and writes the orthogonal eigendecomposition with its matrix definitions.",
      elements: [
        spectralTitle,
        spectralAssumption,
        spectralEquation,
        spectralDetails,
      ],
    },
    {
      title: "02 / Spectral sum",
      sectionId: "lecture",
      description:
        "The definitions below the decomposition are erased and replaced by the sum of rank-one projections. The orthogonal decomposition remains visible.",
      elements: [
        spectralTitle,
        spectralAssumption,
        spectralEquation,
        spectralSum,
      ],
    },
  ],
  "text-table": [
    {
      title: "01 / Definitions and base-year data",
      sectionId: "lecture",
      description:
        "The board defines nominal and real output and records one base-year data row.",
      elements: [economicsTitle, economicsText, economicsTable],
    },
    {
      title: "02 / A second row and an observation",
      sectionId: "lecture",
      description:
        "The table gains a second year, and an annotation observes that real output is unchanged at 120 in base-year units.",
      elements: [
        economicsTitle,
        economicsText,
        economicsExtended,
        box(
          "economics-note",
          "annotation",
          "Real GDP in 2025: 150 / 1.25 = 120 (base-year units).",
          0.06,
          0.83,
          0.88,
          0.06,
        ),
      ],
    },
  ],
};
