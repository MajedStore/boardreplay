import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getProviders,
  reconstructLesson,
  reconstructWithProvider,
  extractionSchema,
} from "../lib/ai";
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
  title: "Linear equations",
  course: "Mathematics",
  topic: "Solving",
  language: "Original language",
  instructions: "",
};
const images = [
  { id: "later", sequence: 1, mimeType: "image/jpeg", base64: "bGF0ZXI=" },
  {
    id: "earlier",
    sequence: 0,
    mimeType: "image/jpeg",
    base64: "ZWFybGllcg==",
  },
];
const observation = {
  language: "English",
  boardOverview: "Two lines of algebra",
  unreadableRegions: [],
  items: [
    {
      id: "item-1",
      type: "equation",
      text: "2 + 2 = 5",
      latex: "2+2=5",
      spatialRelationships: [],
      uncertainty: null,
    },
  ],
};
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
        items: [],
        unreadableRegions: ["Lower-right equation is illegible."],
      }).success,
    ).toBe(true);
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
  it("extracts each image in user order, reconstructs, and validates source references", async () => {
    const calls: GenerateRequest<unknown>[] = [];
    const provider: AiProvider = {
      id: "openai",
      model: "mock-vision-model",
      async generate<T>(
        request: GenerateRequest<T>,
      ): Promise<GenerateResult<T>> {
        calls.push(request as GenerateRequest<unknown>);
        const payload = request.images.length
          ? observation
          : reconstructionFixture();
        return {
          rawOutput: JSON.stringify(payload),
          structuredOutput: request.schema?.parse(payload),
          model: "actual-mocked-model",
        };
      },
    };
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
      [],
    ]);
    expect(stages).toEqual(["EXTRACTING", "RECONSTRUCTING"]);
    expect(result.extractions.map((extraction) => extraction.imageId)).toEqual([
      "earlier",
      "later",
    ]);
    expect(result.model).toBe("actual-mocked-model");
    expect(result.reconstruction.steps[0].originalText).toBe("2 + 2 = 5");
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
    sdkMocks.openAiParse.mockResolvedValue({
      status: "completed",
      output_text: JSON.stringify(observation),
      output_parsed: observation,
      model: "actual-openai-model",
    });
    const output = await new OpenAiProvider(
      "test-key",
      "configured-openai-model",
    ).generate(request);
    const sent = sdkMocks.openAiParse.mock.calls[0][0];
    expect(sent.model).toBe("configured-openai-model");
    expect(sent.store).toBe(false);
    expect(sent.text.format).toMatchObject({
      type: "json_schema",
      strict: true,
      name: "board_observation",
    });
    expect(sent.input[0].content[2]).toMatchObject({
      type: "input_image",
      image_url: "data:image/jpeg;base64,ZWFybGllcg==",
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
      inlineData: { mimeType: "image/jpeg", data: "ZWFybGllcg==" },
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
        data: "ZWFybGllcg==",
      },
    });
    expect(output.model).toBe("actual-claude-model");
  });
  it("rejects incomplete provider output before accepting any reconstruction", async () => {
    sdkMocks.openAiParse.mockResolvedValue({
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
