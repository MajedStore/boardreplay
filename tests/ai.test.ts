import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import {
  getProviders,
  reconstructLesson,
  reconstructWithProvider,
  benchmark,
  extractionSchema,
  aiReconstructionSchema,
} from "../lib/ai";
import { aiBoardElementSchema } from "../lib/ai/wire-schemas";
import type { BoardChange, ContentType } from "../lib/types";
import type {
  AiProvider,
  GenerateRequest,
  GenerateResult,
} from "../lib/ai/contracts";
import { AiError, safeAiError, withBoundedRetry } from "../lib/ai/errors";
import { verifyArithmetic } from "../lib/reconstruction/arithmetic";
import { validateReconstruction } from "../lib/reconstruction/validate";
import { OpenAiProvider } from "../lib/ai/providers/openai";
import { GeminiProvider } from "../lib/ai/providers/gemini";
import { AnthropicProvider } from "../lib/ai/providers/anthropic";

const sdkMocks = vi.hoisted(() => ({
  openAiParse: vi.fn(),
  openAiCreate: vi.fn(),
  geminiGenerate: vi.fn(),
  claudeCreate: vi.fn(),
  openAiConstructor: vi.fn(),
  geminiConstructor: vi.fn(),
  claudeConstructor: vi.fn(),
}));
vi.mock("openai", () => ({
  default: class {
    responses = { parse: sdkMocks.openAiParse, create: sdkMocks.openAiCreate };
    constructor(options: unknown) {
      sdkMocks.openAiConstructor(options);
    }
  },
}));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: sdkMocks.geminiGenerate };
    constructor(options: unknown) {
      sdkMocks.geminiConstructor(options);
    }
  },
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: sdkMocks.claudeCreate };
    constructor(options: unknown) {
      sdkMocks.claudeConstructor(options);
    }
  },
}));

const lesson = {
  title: "Captured university lecture",
  course: "",
  topic: "",
  language: "Original language",
  instructions: "",
};
const fixturePixels = async (background: string) => (await sharp({ create: { width: 80, height: 80, channels: 3, background } }).jpeg().toBuffer()).toString("base64");
const earlierPixels = await fixturePixels("#ffffff");
const laterPixels = await fixturePixels("#eeeeee");
const visualAssessment = { boardBounds: null, readableFraction: 1, visibleBoardFraction: 1, qualityNotes: [], occlusions: [] };
const images = [
  { id: "later", sequence: 1, mimeType: "image/jpeg", base64: laterPixels },
  {
    id: "earlier",
    sequence: 0,
    mimeType: "image/jpeg",
    base64: earlierPixels,
  },
];
const observation = {
  language: "English",
  boardState: "CONTENT",
  disciplines: ["Software engineering"],
  boardAspectRatio: 1.6,
  boardOverview: "A visible linked-list insertion statement",
  unreadableRegions: [],
  items: [
    {
      id: "item-1",
      type: "code",
      semanticLabel: null,
      text: "newNode->next = current;",
      latex: null,
      codeLanguage: "cpp",
      linkingKey: "insertion code at lower left",
      sourceRegion: { x: 0.1, y: 0.55, width: 0.7, height: 0.2 },
      mark: "VISIBLE",
      spatialRelationships: [],
      visual: null,
      uncertainty: null,
    },
  ],
};

type Domain =
  | "engineering diagram"
  | "programming"
  | "advanced mathematics"
  | "text and table";

function boardElement(
  id: string,
  type: ContentType,
  text: string,
  imageId = "earlier",
  overrides: Record<string, unknown> = {},
) {
  return aiBoardElementSchema.parse({
    id,
    type,
    text,
    semanticLabel: null,
    latex: null,
    codeLanguage: null,
    layout: { x: 0.1, y: 0.1, width: 0.35, height: 0.2 },
    layoutBasis: "SOURCE_ESTIMATED",
    sourceImageIds: [imageId],
    sourceRegion: null,
    evidenceStatus: "OBSERVED",
    uncertainty: null,
    visual: null,
    ...overrides,
  });
}

/** Authored, inspectable states: tests check contract fidelity, not vision accuracy. */
function universalFixture(domain: Domain) {
  let initial: ReturnType<typeof boardElement>[];
  let updated: ReturnType<typeof boardElement>;
  let action: "MODIFY" | "CORRECT" = "MODIFY";
  if (domain === "engineering diagram") {
    initial = [
      boardElement("sensor", "shape", "Sensor", "earlier", {
        visual: {
          shape: "rectangle",
          fromId: null,
          toId: null,
          points: [],
          label: "Sensor",
        },
      }),
      boardElement("controller", "shape", "Controller", "earlier", {
        layout: { x: 0.6, y: 0.1, width: 0.3, height: 0.2 },
        visual: {
          shape: "rectangle",
          fromId: null,
          toId: null,
          points: [],
          label: "Controller",
        },
      }),
      boardElement("signal", "arrow", "Signal", "earlier", {
        layout: { x: 0.46, y: 0.17, width: 0.13, height: 0.05 },
        visual: {
          shape: "arrow",
          fromId: "sensor",
          toId: "controller",
          points: [],
          label: "Signal",
        },
      }),
      boardElement(
        "circuit-source",
        "image_crop",
        "Partially hidden motor wiring",
        "earlier",
        {
          layout: { x: 0.1, y: 0.5, width: 0.8, height: 0.35 },
          sourceRegion: {
            imageId: "earlier",
            x: 0.1,
            y: 0.5,
            width: 0.8,
            height: 0.35,
          },
          evidenceStatus: "UNCERTAIN",
          uncertainty:
            "A connector is hidden; preserve the source region without inventing wiring.",
        },
      ),
    ];
    updated = boardElement("signal", "arrow", "Filtered signal", "later", {
      layout: { x: 0.46, y: 0.17, width: 0.13, height: 0.05 },
      visual: {
        shape: "arrow",
        fromId: "sensor",
        toId: "controller",
        points: [],
        label: "Filtered signal",
      },
    });
  } else if (domain === "programming") {
    initial = [
      boardElement("node-a", "shape", "A | 10"),
      boardElement(
        "insertion",
        "code",
        "newNode->next = current;\ncurrent->next = newNode;",
        "earlier",
        {
          codeLanguage: "cpp",
          layout: { x: 0.1, y: 0.4, width: 0.8, height: 0.45 },
        },
      ),
    ];
    updated = boardElement(
      "insertion",
      "code",
      "newNode->next = current->next;\ncurrent->next = newNode;",
      "later",
      {
        codeLanguage: "cpp",
        layout: { x: 0.1, y: 0.4, width: 0.8, height: 0.45 },
      },
    );
    action = "CORRECT";
  } else if (domain === "advanced mathematics") {
    initial = [
      boardElement("fourier", "equation", "Fourier expansion", "earlier", {
        latex: "f(x) \\sim \\frac{a_0}{2}+\\sum_{n=1}^{\\infty}a_n\\cos(nx)",
        layout: { x: 0.1, y: 0.1, width: 0.8, height: 0.25 },
      }),
      boardElement(
        "assumptions",
        "paragraph",
        "Assume f is piecewise smooth and 2π-periodic.",
        "earlier",
        {
          layout: { x: 0.1, y: 0.5, width: 0.8, height: 0.2 },
        },
      ),
    ];
    updated = boardElement(
      "fourier",
      "equation",
      "Fourier expansion with sine terms",
      "later",
      {
        latex:
          "f(x) \\sim \\frac{a_0}{2}+\\sum_{n=1}^{\\infty}(a_n\\cos(nx)+b_n\\sin(nx))",
        layout: { x: 0.1, y: 0.1, width: 0.8, height: 0.25 },
      },
    );
  } else {
    initial = [
      boardElement(
        "definition",
        "paragraph",
        "Opportunity cost: the value of the next best alternative.",
      ),
      boardElement(
        "tradeoffs",
        "table",
        "| Choice | Benefit | Cost |\n| --- | --- | --- |\n| A | 12 | 4 |",
        "earlier",
        {
          layout: { x: 0.1, y: 0.4, width: 0.8, height: 0.4 },
        },
      ),
    ];
    updated = boardElement(
      "tradeoffs",
      "table",
      "| Choice | Benefit | Cost |\n| --- | --- | --- |\n| A | 12 | 4 |\n| B | 9 | 3 |",
      "later",
      {
        layout: { x: 0.1, y: 0.4, width: 0.8, height: 0.4 },
      },
    );
  }
  const moment = (index: number, changes: BoardChange[]) => ({
    id: `moment-${index}`,
    type: "diagram" as const,
    sectionId: "topic-1",
    text: `Captured ${domain} state ${index + 1}.`,
    latex: null,
    stepIndex: index,
    sourceImageIds: [index ? "later" : "earlier"],
    evidenceStatus: "OBSERVED" as const,
    uncertainty: null,
    originalText: null,
    explanation: false,
    changes,
  });
  const unchanged = initial
    .filter((element) => element.id !== updated.id)
    .map((element) => ({
      id: `keep-${element.id}`,
      action: "UNCHANGED" as const,
      targetId: element.id,
      element: null,
      description: "Still visible in the later photograph.",
    }));
  const output = aiReconstructionSchema.parse({
    schemaVersion: 2,
    title: domain,
    overview: `Two captured states of ${domain}.`,
    disciplines: [domain],
    board: { aspectRatio: 1.6 },
    concepts: [domain],
    sections: [{ id: "topic-1", title: "Captured topic" }],
    unresolved: [],
    steps: [
      moment(
        0,
        initial.map((element) => ({
          id: `add-${element.id}`,
          action: "ADD",
          targetId: null,
          element,
          description: "Visible initial content.",
        })),
      ),
      moment(1, [
        ...unchanged,
        {
          id: `update-${updated.id}`,
          action,
          targetId: updated.id,
          element: updated,
          description: "Visible change in the later photograph.",
        },
      ]),
    ],
  });
  const states = [
    initial,
    initial.map((element) => (element.id === updated.id ? updated : element)),
  ];
  const observations = states.map((elements) =>
    extractionSchema.parse({
      language: "English",
      boardState: "CONTENT",
      disciplines: [domain],
      boardAspectRatio: 1.6,
      boardOverview: `A ${domain} board.`,
      unreadableRegions: [],
      items: elements.map((element) => ({
        id: element.id,
        type: element.type,
        semanticLabel: element.semanticLabel,
        text: element.text,
        latex: element.latex,
        codeLanguage: element.codeLanguage,
        linkingKey: `${element.id}: ${element.text.slice(0, 50)}`,
        sourceRegion: element.sourceRegion
          ? {
              x: element.sourceRegion.x,
              y: element.sourceRegion.y,
              width: element.sourceRegion.width,
              height: element.sourceRegion.height,
            }
          : null,
        mark: "VISIBLE",
        spatialRelationships: [],
        visual: element.visual,
        uncertainty: element.uncertainty,
      })),
    }),
  );
  return { output, observations };
}

function mockProvider(
  fixture: ReturnType<typeof universalFixture>,
  calls: GenerateRequest<unknown>[] = [],
): AiProvider {
  return {
    id: "openai",
    model: "mock-vision-model",
    async generate<T>(request: GenerateRequest<T>): Promise<GenerateResult<T>> {
      calls.push(request as GenerateRequest<unknown>);
      const context = request.schemaName === "reconstructed_lesson" ? JSON.parse(request.prompt.split("INCREMENTAL STATE CONTEXT: ")[1].split("\nReturn")[0]) : null;
      const payload = request.schemaName === "board_observation"
        ? { ...fixture.observations[request.images[0].id === "earlier" ? 0 : 1], visualAssessment }
        : request.schemaName === "organized_photos"
          ? organizationFixture(["earlier", "later"].filter((id) => request.images.some((image) => image.id === id)))
          : { ...fixture.output, steps: fixture.output.steps[context.momentIndex] ? [fixture.output.steps[context.momentIndex]] : [] };
      return {
        rawOutput: JSON.stringify(payload),
        structuredOutput: request.schema?.parse(request.normalizeOutput ? request.normalizeOutput(payload) : payload),
        model: "actual-mocked-model",
      };
    },
  };
}
function organizationFixture(ids: string[]) {
  return {
    version: 1, mode: "AUTOMATIC", warnings: [], duplicateGroups: [],
    sequences: [{ id: "main-sequence", title: "Captured topic", orderingConfidence: "HIGH", uncertainty: null, states: ids.map((id, index) => ({ id: `state-${index}`, imageIds: [id], primaryImageId: id, reason: "Authored visible state fixture.", confidence: "HIGH" })) }],
    relationships: ids.slice(1).map((id, index) => ({ fromImageId: ids[index], toImageId: id, kind: "BEFORE", confidence: "HIGH", reason: "The fixture captures a visible addition or correction." })),
  };
}
function reconstructionFixture() {
  return {
    title: "An arithmetic correction",
    overview: "A captured error followed by a correction.",
    concepts: ["Equality"],
    sections: [{ id: "section-1", title: "Correction" }],
    unresolved: [],
    steps: [
      {
        id: "corrected",
        type: "equation",
        sectionId: "section-1",
        text: "The professor corrected the sum.",
        latex: "2+2=4",
        stepIndex: 1,
        sourceImageIds: ["later"],
        evidenceStatus: "OBSERVED",
        uncertainty: null,
        originalText: "2 + 2 = 4",
        explanation: false,
      },
      {
        id: "earlier-error",
        type: "equation",
        sectionId: "section-1",
        text: "Earlier captured statement.",
        latex: "2+2=5",
        stepIndex: 0,
        sourceImageIds: ["earlier"],
        evidenceStatus: "OBSERVED",
        uncertainty: "Corrected in the next photograph.",
        originalText: "2 + 2 = 5",
        explanation: false,
      },
    ],
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("structured observations", () => {
  it("accepts explicit unreadability and rejects missing schema fields", () => {
    expect(extractionSchema.safeParse(observation).success).toBe(true);
    expect(
      extractionSchema.safeParse({ ...observation, items: [{ text: "guess" }] })
        .success,
    ).toBe(false);
    expect(
      extractionSchema.safeParse({
        ...observation,
        boardState: "UNREADABLE",
        items: [],
        unreadableRegions: ["Lower-right handwritten annotation is illegible."],
      }).success,
    ).toBe(true);
  });

  it("represents unlisted subject matter without coercing it to equations", () => {
    const custom = {
      ...observation,
      items: [
        {
          ...observation.items[0],
          type: "other",
          semanticLabel: "Anatomical tissue section",
          codeLanguage: null,
        },
      ],
    };
    expect(extractionSchema.parse(custom).items[0].semanticLabel).toBe(
      "Anatomical tissue section",
    );
  });

  it("uses typed spatial relationships rather than prose-only diagram descriptions", () => {
    const diagram = universalFixture("engineering diagram").observations[0];
    diagram.items[0].spatialRelationships = [
      { relation: "POINTS_TO", targetId: "controller", uncertainty: null },
    ];
    expect(
      extractionSchema.parse(diagram).items[0].spatialRelationships[0].targetId,
    ).toBe("controller");
    expect(
      extractionSchema.safeParse({
        ...diagram,
        items: [
          { ...diagram.items[0], spatialRelationships: ["points somewhere"] },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("source integrity and chronology", () => {
  it("orders steps and preserves both an error and its correction", () => {
    const output = validateReconstruction(reconstructionFixture(), [
      "earlier",
      "later",
    ]);
    expect(output.steps.map((step) => step.id)).toEqual([
      "earlier-error",
      "corrected",
    ]);
    expect(output.steps.map((step) => step.stepIndex)).toEqual([0, 1]);
    expect(output.steps[0].sourceImageIds).toEqual(["earlier"]);
    expect(output.steps[1].sourceImageIds).toEqual(["later"]);
    expect(output.steps[0].verification?.status).toBe("SUSPICIOUS");
    expect(output.steps[1].verification?.status).toBe("VERIFIED");
  });

  it("rejects invented source citations and duplicate step identifiers", () => {
    const invented = reconstructionFixture();
    invented.steps[0].sourceImageIds = ["unseen-image"];
    expect(() =>
      validateReconstruction(invented, ["earlier", "later"]),
    ).toThrow(/outside this lesson/);
    const duplicate = reconstructionFixture();
    duplicate.steps[1].id = duplicate.steps[0].id;
    expect(() =>
      validateReconstruction(duplicate, ["earlier", "later"]),
    ).toThrow(/unique/);
  });

  it("marks unsupported observations uncertain and keeps user-supplied material distinct", () => {
    const missing = reconstructionFixture();
    missing.steps[0].sourceImageIds = [];
    const output = validateReconstruction(missing, ["earlier", "later"]);
    expect(output.steps[1].evidenceStatus).toBe("UNCERTAIN");
    expect(output.steps[1].uncertainty).toContain("No source photograph");
    const userEdited = {
      ...missing,
      steps: missing.steps.map((step) => ({
        ...step,
        evidenceStatus: "USER_EDITED",
      })),
    };
    expect(
      validateReconstruction(userEdited, ["earlier", "later"]).steps[1]
        .evidenceStatus,
    ).toBe("USER_EDITED");
  });

  it("keeps repeated captured expressions when their lecture meaning differs", () => {
    const fixture = reconstructionFixture();
    fixture.steps[0].latex = fixture.steps[1].latex;
    fixture.steps[0].text = "A different example using the same equality.";
    expect(
      validateReconstruction(fixture, ["earlier", "later"]).steps,
    ).toHaveLength(2);
  });
});

describe("deterministic arithmetic", () => {
  it.each([
    "2+3*4=14",
    "\\frac{1}{2}+\\frac{1}{2}=1",
    "-2^2=-4",
    "2^{3}=8",
    "0.1+0.2=0.3",
  ])("checks %s", (expression) => {
    expect(verifyArithmetic(expression).status).toBe("VERIFIED");
  });
  it("flags a false numeric equality", () => {
    expect(verifyArithmetic("2+2=5").status).toBe("SUSPICIOUS");
  });
  it.each([
    "x^2=4",
    "1/0=5",
    "\\begin{aligned}2+2&=4\\end{aligned}",
    "process.exit()=0",
    "2+2",
    "2=2=3",
  ])("does not overclaim for %s", (expression) => {
    expect(verifyArithmetic(expression).status).not.toBe("VERIFIED");
  });
});

describe("real pipeline with mocked provider responses", () => {
  it("analyzes each image, organizes visible states, and incrementally validates sources", async () => {
    const calls: GenerateRequest<unknown>[] = [];
    const fixture = universalFixture("programming");
    const provider = mockProvider(fixture, calls);
    const stages: string[] = [];
    const result = await reconstructWithProvider(
      {
        lesson,
        images,
        onStage: (stage) => {
          stages.push(stage);
        },
      },
      provider,
    );
    expect(calls.map((call) => call.images.map((image) => image.id))).toEqual([
      ["earlier"],
      ["later"],
      ["earlier", "later"],
      ["earlier"],
      ["later", "earlier"],
    ]);
    expect(stages).toEqual(["ANALYZING", "FINDING_DUPLICATES", "ORGANIZING", "RECONSTRUCTING"]);
    expect(result.extractions.map((extraction) => extraction.imageId)).toEqual([
      "earlier",
      "later",
    ]);
    expect(result.model).toBe("actual-mocked-model");
    expect(result.reconstruction.steps[0].changes?.[1].element?.text).toContain(
      "newNode->next = current;",
    );
    expect(result.reconstruction.steps[1].changes?.[1].action).toBe("CORRECT");
    expect(calls[2].prompt).toContain('"imageId":"earlier"');
    expect(calls[2].prompt).toContain('"imageId":"later"');
  });

  it.each<Domain>([
    "engineering diagram",
    "programming",
    "advanced mathematics",
    "text and table",
  ])(
    "reconstructs faithful temporal and spatial %s fixtures",
    async (domain) => {
      const fixture = universalFixture(domain);
      const { reconstruction } = await reconstructWithProvider(
        { lesson, images },
        mockProvider(fixture),
      );
      expect(reconstruction.schemaVersion).toBe(2);
      expect(reconstruction.disciplines).toEqual([domain]);
      expect(reconstruction.steps.map((step) => step.sourceImageIds)).toEqual([
        ["earlier"],
        ["later"],
      ]);
      expect(
        reconstruction.steps.flatMap((step) => step.changes || []),
      ).toHaveLength(
        fixture.output.steps.reduce(
          (count, step) => count + step.changes.length,
          0,
        ),
      );
      const firstPayload = reconstruction.steps[0].changes?.find(
        (change) =>
          change.element?.id ===
          fixture.output.steps[1].changes.at(-1)?.targetId,
      )?.element;
      const updated = reconstruction.steps[1].changes?.at(-1)?.element;
      expect(firstPayload?.id).toBe(updated?.id);
      expect(firstPayload?.text).not.toBe(updated?.text);
      expect(firstPayload?.sourceImageIds).toEqual(["earlier"]);
      expect(updated?.sourceImageIds).toEqual(["later"]);
      if (domain === "engineering diagram") {
        const cropped = reconstruction.steps[0].changes?.find(
          (change) => change.element?.type === "image_crop",
        )?.element;
        expect(cropped?.sourceRegion?.imageId).toBe("earlier");
        expect(cropped?.evidenceStatus).toBe("UNCERTAIN");
        expect(updated?.visual?.toId).toBe("controller");
      }
      if (domain === "advanced mathematics") {
        expect(firstPayload?.latex).toContain("\\sum");
        expect(updated?.latex).toContain("b_n");
      }
      if (domain === "programming") {
        expect(updated?.codeLanguage).toBe("cpp");
        expect(updated?.text).toContain("current->next;");
      }
      if (domain === "text and table") expect(updated?.type).toBe("table");
    },
  );

  it("rejects backwards chronology and incomplete coverage while preserving prior content for unverifiable changes", async () => {
    const reversed = universalFixture("programming");
    reversed.output.steps[0].sourceImageIds = ["later"];
    reversed.output.steps[1].sourceImageIds = ["earlier"];
    await expect(
      reconstructWithProvider({ lesson, images }, mockProvider(reversed)),
    ).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
    const fabricated = universalFixture("programming");
    fabricated.output.steps[1].changes.at(-1)!.element!.sourceImageIds = [
      "unseen",
    ];
    const recovered = await reconstructWithProvider({ lesson, images }, mockProvider(fabricated));
    expect(recovered.reconstruction.unresolved.join(" ")).toContain("unresolved text:");
    expect(recovered.reconstruction.steps[1].changes!.some((change) => change.element?.sourceImageIds.includes("unseen"))).toBe(false);
    const omitted = universalFixture("programming");
    omitted.output.steps.pop();
    await expect(
      reconstructWithProvider({ lesson, images }, mockProvider(omitted)),
    ).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
  });

  it("rejects a future photograph used as evidence for an earlier element", async () => {
    const fixture = universalFixture("programming");
    fixture.output.steps[0].sourceImageIds.push("later");
    fixture.output.steps[0].changes[0].element!.sourceImageIds = ["later"];
    await expect(
      reconstructWithProvider({ lesson, images }, mockProvider(fixture)),
    ).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
  });

  it("rejects invented observation endpoints while recovering out-of-frame optional crops", async () => {
    const invented = universalFixture("engineering diagram");
    invented.observations[0].items[0].spatialRelationships.push({
      relation: "CONNECTS_TO",
      targetId: "unseen-node",
      uncertainty: null,
    });
    await expect(
      reconstructWithProvider({ lesson, images }, mockProvider(invented)),
    ).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
    const outside = universalFixture("engineering diagram");
    outside.observations[0].items[0].sourceRegion = {
      x: 0.9,
      y: 0.1,
      width: 0.2,
      height: 0.2,
    };
    const calls: GenerateRequest<unknown>[] = [];
    const recovered = await reconstructWithProvider({ lesson, images }, mockProvider(outside, calls));
    expect(recovered.extractions[0].items[0].text).toBe(outside.observations[0].items[0].text);
    expect(recovered.extractions[0].items[0].sourceRegion).toBeNull();
    expect(recovered.reconstruction.unresolved.join(" ")).toContain("Exact source highlighting");
    expect(calls.filter((call) => call.schemaName === "board_observation")).toHaveLength(2);
  });

  it("makes one bounded structural repair request while preserving the other valid photo extractions", async () => {
    const fixture = universalFixture("programming");
    const provider = mockProvider(fixture);
    const generate = provider.generate.bind(provider);
    const calls: GenerateRequest<unknown>[] = [];
    let malformed = true;
    provider.generate = async <T>(request: GenerateRequest<T>) => {
      calls.push(request as GenerateRequest<unknown>);
      if (malformed && request.schemaName === "board_observation") {
        malformed = false;
        return { rawOutput: '{"malformed":true}', structuredOutput: { malformed: true } as T, model: "mock-model" };
      }
      return generate(request);
    };
    const result = await reconstructWithProvider({ lesson, images }, provider);
    expect(result.extractions).toHaveLength(2);
    expect(calls).toHaveLength(6);
    expect(calls[1].prompt).toContain("previous response did not match");
    expect(result.extractions[0].items[0].text).toBe(fixture.observations[0].items[0].text);
  });

  it("does not accept legacy summary-only provider output as a visual reconstruction", async () => {
    const fixture = universalFixture("programming");
    const provider = mockProvider(fixture);
    const generate = provider.generate.bind(provider);
    provider.generate = async <T>(request: GenerateRequest<T>) =>
      request.schemaName === "reconstructed_lesson"
        ? {
            rawOutput: JSON.stringify(reconstructionFixture()),
            structuredOutput: reconstructionFixture() as T,
            model: "mock",
          }
        : generate(request);
    await expect(
      reconstructWithProvider({ lesson, images }, provider),
    ).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
  });

  it("rejects empty spatial event summaries for captures containing visible content", async () => {
    const fixture = universalFixture("programming");
    fixture.output.steps.forEach((moment) => {
      moment.changes = [];
    });
    await expect(
      reconstructWithProvider({ lesson, images }, mockProvider(fixture)),
    ).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
  });

  it("accepts unchanged cited content without requiring new additions in each capture", async () => {
    const fixture = universalFixture("programming");
    fixture.observations[1] = structuredClone(fixture.observations[0]);
    fixture.output.steps[1].changes = fixture.output.steps[0].changes.map(
      (change) => ({
        id: `still-visible-${change.element!.id}`,
        action: "UNCHANGED",
        targetId: change.element!.id,
        element: null,
        description: "The same photographed content remains visible.",
      }),
    );
    const { reconstruction } = await reconstructWithProvider(
      { lesson, images },
      mockProvider(fixture),
    );
    expect(
      reconstruction.steps[1].changes?.every(
        (change) => change.action === "UNCHANGED" && change.element === null,
      ),
    ).toBe(true);
  });

  it("requires an uncertain source crop for an unreadable capture instead of unsupported transcription", async () => {
    const fixture = universalFixture("programming");
    fixture.output.steps = [fixture.output.steps[0]];
    fixture.observations[0] = extractionSchema.parse({
      ...fixture.observations[0],
      boardState: "UNREADABLE",
      items: [],
      unreadableRegions: ["Blur prevents reliable transcription of this board."],
    });
    const firstImage = images.filter((image) => image.id === "earlier");
    await expect(
      reconstructWithProvider(
        { lesson, images: firstImage },
        mockProvider(fixture),
      ),
    ).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
    fixture.output.steps[0].changes = [
      {
        id: "preserve-unreadable-photo",
        action: "ADD",
        targetId: null,
        element: boardElement(
          "unreadable-photo",
          "image_crop",
          "Original unreadable board photograph",
          "earlier",
          {
            evidenceStatus: "UNCERTAIN",
            uncertainty:
              "Blur prevents reliable transcription; inspect the original.",
          },
        ),
        description:
          "Preserve the actual source rather than inventing its writing.",
      },
    ];
    const { reconstruction } = await reconstructWithProvider(
      { lesson, images: firstImage },
      mockProvider(fixture),
    );
    expect(reconstruction.steps[0].changes?.[0].element).toMatchObject({
      type: "image_crop",
      sourceImageIds: ["earlier"],
      sourceRegion: null,
      evidenceStatus: "UNCERTAIN",
      visual: null,
    });
  });

  it.each(["older-region", "older-whole-photo"] as const)(
    "rejects an %s fallback that cites an unreadable new capture without displaying it",
    async (fallback) => {
      const fixture = universalFixture("engineering diagram");
      fixture.observations[1] = extractionSchema.parse({
        ...fixture.observations[1],
        boardState: "UNREADABLE",
        items: [],
        unreadableRegions: ["The later capture is blurred."],
      });
      const crop = structuredClone(
        fixture.output.steps[0].changes.find(
          (change) => change.element?.type === "image_crop",
        )!.element!,
      );
      crop.sourceImageIds = ["earlier", "later"];
      if (fallback === "older-whole-photo") crop.sourceRegion = null;
      fixture.output.steps[1].sourceImageIds = ["earlier", "later"];
      fixture.output.steps[1].changes = [
        {
          id: "incorrect-new-capture-fallback",
          action: "CORRECT",
          targetId: crop.id,
          element: crop,
          description: "This payload still displays the earlier photograph.",
        },
      ];
      await expect(
        reconstructWithProvider({ lesson, images }, mockProvider(fixture)),
      ).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
    },
  );

  it("uses an explicitly uncertain whole-photo fallback when a crop cannot be recovered", async () => {
    const fixture = universalFixture("engineering diagram");
    const element = fixture.output.steps[0].changes.at(-1)!.element!;
    element.sourceRegion = null;
    element.layoutBasis = "AUTO_LAYOUT";
    element.uncertainty =
      "A trustworthy crop or source position is unavailable; show the full photograph.";
    const { reconstruction } = await reconstructWithProvider(
      { lesson, images },
      mockProvider(fixture),
    );
    const preserved = reconstruction.steps[0].changes?.at(-1)?.element;
    expect(preserved?.type).toBe("image_crop");
    expect(preserved?.sourceRegion).toBeNull();
    expect(preserved?.layoutBasis).toBe("AUTO_LAYOUT");
    expect(preserved?.sourceImageIds).toEqual(["earlier"]);
  });

  it.each(["arrow", "shape"] as const)(
    "preserves a cited %s source region when editable geometry is unavailable",
    async (type) => {
      const fixture = universalFixture("engineering diagram");
      const element = fixture.output.steps[0].changes.find(
        (change) => change.element?.type === type,
      )!.element!;
      element.visual = null;
      element.sourceRegion = {
        imageId: "earlier",
        x: 0.1,
        y: 0.1,
        width: 0.6,
        height: 0.3,
      };
      element.evidenceStatus = "UNCERTAIN";
      element.uncertainty =
        "The visible graphic cannot be recovered as reliable editable geometry.";
      const { reconstruction } = await reconstructWithProvider(
        { lesson, images },
        mockProvider(fixture),
      );
      const preserved = reconstruction.steps[0].changes?.find(
        (change) => change.element?.id === element.id,
      )?.element;
      expect(preserved).toMatchObject({
        id: element.id,
        type: "image_crop",
        semanticLabel: type,
        text: element.text,
        sourceImageIds: ["earlier"],
        sourceRegion: element.sourceRegion,
        evidenceStatus: "UNCERTAIN",
        visual: null,
      });
    },
  );

  it("rejects duplicate photograph positions instead of inventing their chronology", async () => {
    await expect(
      reconstructWithProvider(
        { lesson, images: images.map((image) => ({ ...image, sequence: 0 })) },
        mockProvider(universalFixture("programming")),
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("preserves erased content and previous topics in the event history", async () => {
    const fixture = universalFixture("programming");
    fixture.output.steps[1].changes = [
      {
        id: "erase-code",
        action: "ERASE",
        targetId: "insertion",
        element: null,
        description: "The later photograph shows the code area erased.",
      },
      {
        id: "clear-topic",
        action: "NEW_TOPIC",
        targetId: null,
        element: null,
        description: "The board is cleared for a visibly new topic.",
      },
      {
        id: "add-complexity",
        action: "ADD",
        targetId: null,
        element: boardElement(
          "complexity-note",
          "paragraph",
          "Insertion time depends on whether the node is already known.",
          "later",
        ),
        description: "A new topic annotation is visible.",
      },
    ];
    const { reconstruction } = await reconstructWithProvider(
      { lesson, images },
      mockProvider(fixture),
    );
    expect(
      reconstruction.steps[0].changes?.some(
        (change) => change.element?.id === "insertion",
      ),
    ).toBe(true);
    expect(
      reconstruction.steps[1].changes?.map((change) => change.action),
    ).toEqual(["ERASE", "NEW_TOPIC", "ADD"]);
    expect(reconstruction.steps[0].changes?.[1].element?.text).toContain(
      "newNode->next = current;",
    );
  });

  it("reconstructs an initially blank board, visible addition, and complete erasure", async () => {
    const sourceImages = await Promise.all(["blank-start", "content", "blank-end"].map(async (id, sequence) => ({ ...images[0], id, sequence, base64: await fixturePixels(["#ffffff", "#eeeeee", "#dddddd"][sequence]) })));
    const fixture = universalFixture("text and table");
    const blank = extractionSchema.parse({
      ...observation,
      boardState: "BLANK",
      items: [],
      unreadableRegions: [],
      boardOverview: "The readable board is empty.",
    });
    const content = extractionSchema.parse({
      ...observation,
      items: [
        {
          ...observation.items[0],
          type: "paragraph",
          text: "Supply and demand",
          codeLanguage: null,
        },
      ],
    });
    const payload = aiReconstructionSchema.parse({
      ...fixture.output,
      steps: sourceImages.map((image, index) => ({
        ...fixture.output.steps[0],
        id: `blank-chronology-${index}`,
        stepIndex: index,
        sourceImageIds: [image.id],
        text:
          index === 1 ? "The title appears." : "The captured board is empty.",
        changes:
          index === 0
            ? []
            : index === 1
              ? [
                  {
                    id: "add-title",
                    action: "ADD",
                    targetId: null,
                    element: boardElement(
                      "title",
                      "paragraph",
                      "Supply and demand",
                      "content",
                    ),
                    description: "The title becomes visible.",
                  },
                ]
              : [
                  {
                    id: "erase-title",
                    action: "ERASE",
                    targetId: "title",
                    element: null,
                    description:
                      "The readable board area is now visibly clear.",
                  },
                ],
      })),
    });
    const provider: AiProvider = {
      id: "openai",
      model: "mock",
      async generate<T>(
        request: GenerateRequest<T>,
      ): Promise<GenerateResult<T>> {
        const context = request.schemaName === "reconstructed_lesson" ? JSON.parse(request.prompt.split("INCREMENTAL STATE CONTEXT: ")[1].split("\nReturn")[0]) : null;
        const output = request.schemaName === "board_observation"
          ? { ...(request.images[0].id === "content" ? content : blank), visualAssessment }
          : request.schemaName === "organized_photos"
            ? organizationFixture(sourceImages.map((image) => image.id))
            : { ...payload, steps: [payload.steps[context.momentIndex]] };
        return {
          rawOutput: JSON.stringify(output),
          structuredOutput: request.schema?.parse(output),
          model: "mock",
        };
      },
    };
    const { reconstruction, extractions } = await reconstructWithProvider(
      { lesson, images: sourceImages },
      provider,
    );
    expect(extractions.map((capture) => capture.boardState)).toEqual([
      "BLANK",
      "CONTENT",
      "BLANK",
    ]);
    expect(reconstruction.steps[0].changes).toEqual([]);
    expect(reconstruction.steps[1].changes?.[0].element?.text).toBe(
      "Supply and demand",
    );
    expect(reconstruction.steps[2].changes?.[0].action).toBe("ERASE");
    expect(reconstruction.steps[2].changes?.[0].targetId).toBe("title");
  });

  it("omits uncited automatic elements while retaining source fallbacks and rejects unexplained uncertainty", async () => {
    const uncited = universalFixture("programming");
    uncited.output.steps[0].changes[0].element!.sourceImageIds = [];
    const recovered = await reconstructWithProvider({ lesson, images }, mockProvider(uncited));
    expect(recovered.reconstruction.unresolved.join(" ")).toContain("CONTENT_UNATTRIBUTED");
    expect(recovered.reconstruction.steps.flatMap((step) => step.changes || []).some((change) => change.element && !change.element.sourceImageIds.length)).toBe(false);
    const unexplained = universalFixture("programming");
    unexplained.output.steps[0].changes[0].element!.evidenceStatus =
      "UNCERTAIN";
    unexplained.output.steps[0].changes[0].element!.uncertainty = null;
    await expect(
      reconstructWithProvider({ lesson, images }, mockProvider(unexplained)),
    ).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
  });

  it("rejects observations that confuse content, blankness and unreadability", async () => {
    const malformed = universalFixture("programming");
    malformed.observations[0].boardState = "BLANK";
    await expect(
      reconstructWithProvider({ lesson, images }, mockProvider(malformed)),
    ).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
    const unreadable = universalFixture("programming");
    unreadable.observations[0].boardState = "UNREADABLE";
    await expect(
      reconstructWithProvider({ lesson, images }, mockProvider(unreadable)),
    ).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
  });

  it("fails truthfully without credentials instead of generating sample results", async () => {
    for (const key of ["OPENAI_API_KEY", "GOOGLE_API_KEY", "ANTHROPIC_API_KEY"])
      vi.stubEnv(key, "");
    await expect(reconstructLesson({ lesson, images })).rejects.toMatchObject({
      code: "MISSING_CONFIGURATION",
    });
  });

  it("publishes configured provider metadata without API secrets", () => {
    vi.stubEnv("OPENAI_API_KEY", "secret-never-publish");
    const metadata = getProviders();
    expect(
      metadata.find((provider) => provider.id === "openai")?.configured,
    ).toBe(true);
    expect(JSON.stringify(metadata)).not.toContain("secret-never-publish");
  });

  it("uses frozen benchmark system instructions instead of changing a saved comparison", async () => {
    vi.stubEnv("OPENAI_API_KEY", "mock-benchmark-key");
    sdkMocks.openAiCreate.mockResolvedValue({
      status: "completed",
      output_text: "Captured lecture",
      model: "mock-benchmark-model",
    });
    await benchmark(
      "openai",
      images,
      "Saved common prompt",
      "Frozen historical evidence instructions",
    );
    const sent = sdkMocks.openAiCreate.mock.calls[0][0];
    expect(sent.instructions).toBe("Frozen historical evidence instructions");
    expect(sent.input[0].content[0].text).toBe("Saved common prompt");
  });
});

describe("safe provider failures", () => {
  it("redacts provider error bodies", () => {
    const error = safeAiError({
      status: 401,
      message: "invalid secret-never-publish",
    });
    expect(error.code).toBe("AUTHENTICATION");
    expect(error.message).not.toContain("secret-never-publish");
  });
  it("bounds transient retries to three total attempts", async () => {
    vi.useFakeTimers();
    const operation = vi.fn().mockRejectedValue({ status: 429 });
    const assertion = expect(withBoundedRetry(operation)).rejects.toMatchObject(
      { code: "RATE_LIMIT" },
    );
    await vi.runAllTimersAsync();
    await assertion;
    expect(operation).toHaveBeenCalledTimes(3);
  });
  it("does not retry invalid structured data", async () => {
    const operation = vi
      .fn()
      .mockRejectedValue(
        new AiError("INVALID_OUTPUT", "Invalid structured result."),
      );
    await expect(withBoundedRetry(operation)).rejects.toMatchObject({
      code: "INVALID_OUTPUT",
    });
    expect(operation).toHaveBeenCalledTimes(1);
  });
});

describe("official SDK adapter request formats (network mocked)", () => {
  const request = {
    system: "Preserve visible evidence.",
    prompt: "Extract the board.",
    images: [images[1]],
    schema: extractionSchema,
    schemaName: "board_observation",
  };
  it("uses OpenAI Responses image inputs and strict structured output", async () => {
    sdkMocks.openAiCreate.mockResolvedValue({
      status: "completed",
      output_text: JSON.stringify(observation),
      output_parsed: observation,
      model: "actual-openai-model",
    });
    const output = await new OpenAiProvider(
      "test-key",
      "configured-openai-model",
    ).generate(request);
    const sent = sdkMocks.openAiCreate.mock.calls[0][0];
    expect(sent.model).toBe("configured-openai-model");
    expect(sent.store).toBe(false);
    expect(sent.text.format).toMatchObject({
      type: "json_schema",
      strict: true,
      name: "board_observation",
    });
    expect(sent.input[0].content[2]).toMatchObject({
      type: "input_image",
      image_url: `data:image/jpeg;base64,${earlierPixels}`,
      detail: "high",
    });
    expect(output.model).toBe("actual-openai-model");
    expect(sdkMocks.openAiConstructor).toHaveBeenCalledWith({
      apiKey: "test-key",
      timeout: 90_000,
      maxRetries: 0,
    });
  });
  it("uses Gemini inline image data and JSON schema", async () => {
    sdkMocks.geminiGenerate.mockResolvedValue({
      text: JSON.stringify(observation),
      modelVersion: "actual-gemini-model",
      candidates: [{ finishReason: "STOP" }],
    });
    const output = await new GeminiProvider(
      "test-key",
      "configured-gemini-model",
    ).generate(request);
    const sent = sdkMocks.geminiGenerate.mock.calls[0][0];
    expect(sent.config.responseMimeType).toBe("application/json");
    expect(sent.config.responseJsonSchema.type).toBe("object");
    expect(sent.contents[0].parts[2]).toEqual({
      inlineData: { mimeType: "image/jpeg", data: earlierPixels },
    });
    expect(output.model).toBe("actual-gemini-model");
    expect(sdkMocks.geminiConstructor).toHaveBeenCalledWith({
      apiKey: "test-key",
      httpOptions: { timeout: 90_000, retryOptions: { attempts: 1 } },
    });
  });
  it("uses Anthropic image blocks and GA output_config", async () => {
    sdkMocks.claudeCreate.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(observation) }],
      stop_reason: "end_turn",
      model: "actual-claude-model",
    });
    const output = await new AnthropicProvider(
      "test-key",
      "configured-claude-model",
    ).generate(request);
    const sent = sdkMocks.claudeCreate.mock.calls[0][0];
    expect(sent.output_config.format).toMatchObject({
      type: "json_schema",
      schema: { type: "object" },
    });
    expect(sent.messages[0].content[2]).toEqual({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: earlierPixels,
      },
    });
    expect(output.model).toBe("actual-claude-model");
  });
  it("rejects incomplete provider output before accepting any reconstruction", async () => {
    sdkMocks.openAiCreate.mockResolvedValue({
      status: "incomplete",
      output_text: "{}",
      output_parsed: null,
      model: "actual-model",
    });
    await expect(
      new OpenAiProvider("test-key", "configured-model").generate(request),
    ).rejects.toMatchObject({ code: "INCOMPLETE_OUTPUT" });
  });
});
