import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { OpenAiProvider } from "../lib/ai/providers/openai";
import { GeminiProvider } from "../lib/ai/providers/gemini";
import { AnthropicProvider } from "../lib/ai/providers/anthropic";
import type { AiProvider, GenerateRequest } from "../lib/ai/contracts";
import { normalizeSourceRegion } from "../lib/photos/source-regions";

const sdk = vi.hoisted(() => ({ openai: vi.fn(), gemini: vi.fn(), anthropic: vi.fn() }));
vi.mock("openai", () => ({ default: class { responses = { create: sdk.openai }; } }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class { models = { generateContent: sdk.gemini }; } }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: sdk.anthropic }; } }));

const schema = z.object({
  text: z.string(),
  sourceRegion: z.object({
    x: z.number().min(0).max(1), y: z.number().min(0).max(1),
    width: z.number().positive().max(1), height: z.number().positive().max(1),
  }).strict().nullable(),
}).strict();

type Output = z.infer<typeof schema>;
const adapters: { id: "openai" | "gemini" | "anthropic"; create: () => AiProvider }[] = [
  { id: "openai", create: () => new OpenAiProvider("fake-test-key", "configured-vision-model") },
  { id: "gemini", create: () => new GeminiProvider("fake-test-key", "configured-vision-model") },
  { id: "anthropic", create: () => new AnthropicProvider("fake-test-key", "configured-vision-model") },
];

beforeEach(() => { vi.clearAllMocks(); });

function response(raw: string) {
  sdk.openai.mockResolvedValue({ status: "completed", output_text: raw, model: "actual-provider-model" });
  sdk.gemini.mockResolvedValue({ text: raw, modelVersion: "actual-provider-model", candidates: [{ finishReason: "STOP" }] });
  sdk.anthropic.mockResolvedValue({ content: [{ type: "text", text: raw }], stop_reason: "end_turn", model: "actual-provider-model" });
}

function request(diagnostics: string[]): GenerateRequest<Output> {
  return {
    system: "Preserve visible content and use optional normalized source regions.",
    prompt: "Read the supplied photograph.", images: [{ id: "verified-source", sequence: 0, mimeType: "image/jpeg", base64: "fixture-photo-bytes" }],
    schema, schemaName: "source_recovery_fixture",
    normalizeOutput(value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) return value;
      const output = value as Record<string, unknown>;
      const normalized = normalizeSourceRegion(output.sourceRegion, { imageId: "verified-source" });
      diagnostics.push(...normalized.diagnostics.map((item) => item.code));
      const region = normalized.region;
      return { ...output, sourceRegion: region ? { x: region.x, y: region.y, width: region.width, height: region.height } : null };
    },
  };
}

describe.each(adapters)("$id optional source-region recovery before strict SDK output validation", ({ id, create }) => {
  it.each([
    { name: "negative coordinates", region: { x: -.2, y: .1, width: .4, height: .2 }, warning: true },
    { name: "coordinates beyond boundaries", region: { x: .8, y: .9, width: .4, height: .3 }, warning: true },
    { name: "malformed region fields", region: { x: "unknown", y: .1, width: .4 }, warning: true },
    { name: "missing optional region", region: undefined, warning: false },
  ])("preserves text and raw response with $name using one provider request", async ({ region, warning }) => {
    const raw = ` \n${JSON.stringify({ text: "Recognized university lecture writing", ...(region !== undefined ? { sourceRegion: region } : {}) })}\n`;
    response(raw);
    const diagnostics: string[] = [];
    const result = await create().generate(request(diagnostics));
    expect(result.structuredOutput).toEqual({ text: "Recognized university lecture writing", sourceRegion: null });
    expect(result.rawOutput).toBe(raw);
    expect(result.model).toBe("actual-provider-model");
    expect(sdk[id]).toHaveBeenCalledTimes(1);
    expect(diagnostics.length > 0).toBe(warning);
  });

  it("retains valid source coordinates and recognized content", async () => {
    const output = { text: "Valid source evidence", sourceRegion: { x: .1, y: .2, width: .3, height: .4 } };
    response(JSON.stringify(output));
    const result = await create().generate(request([]));
    expect(result.structuredOutput?.text).toBe(output.text);
    expect(result.structuredOutput?.sourceRegion).toEqual({ x: .1, y: .2, width: expect.closeTo(.3), height: expect.closeTo(.4) });
    expect(sdk[id]).toHaveBeenCalledTimes(1);
  });

  it("keeps core content validation strict after local coordinate recovery", async () => {
    response(JSON.stringify({ text: 42, sourceRegion: { x: -1 } }));
    await expect(create().generate(request([]))).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
    expect(sdk[id]).toHaveBeenCalledTimes(1);
  });
});

it("keeps OpenAI strict response formatting and disables response storage while parsing locally", async () => {
  response(JSON.stringify({ text: "Preserved", sourceRegion: null }));
  await new OpenAiProvider("fake-test-key", "configured-vision-model").generate(request([]));
  const sent = sdk.openai.mock.calls[0][0];
  expect(sent.store).toBe(false);
  expect(sent.text.format).toMatchObject({ type: "json_schema", name: "source_recovery_fixture", strict: true });
  expect(sent.input[0].content[2]).toMatchObject({ type: "input_image", detail: "high" });
});
