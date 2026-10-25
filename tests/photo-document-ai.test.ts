import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { explainWithProvider } from "../lib/ai";
import { photoObservationSchema } from "../lib/ai/wire-schemas";
import type { AiProvider, GenerateRequest, GenerateResult, VisionImage } from "../lib/ai/contracts";
import type { PhotoOrganization } from "../lib/types";

const lesson = { title: "Üniversite ders fotoğrafları", course: "Diferansiyel denklemler ve programlama", topic: "", language: "Original language", instructions: "" };
const words: Record<string, string> = {
  a: "Birinci mertebeden diferansiyel denklem: y' + p(x)y = q(x)",
  b: "İntegral çarpanı: mu(x) = exp(integral p(x) dx)",
  c: "Düzeltme: sabit katsayı önceki satırdaki eksi işareti yerine artıdır.",
  d: "Node* node = new Node{20, nullptr};",
  e: "node->next = current->next; current->next = node;",
  f: "RC devresinin zaman sabiti: tau = RC",
  g: "Birimler: R ohm, C farad, tau saniye",
};
const baseId = (id: string) => id === "a-copy" ? "a" : id === "b-angle" ? "b" : id;
const observation = (id: string) => photoObservationSchema.parse({
  language: "Türkçe", boardState: "CONTENT", disciplines: ["Matematik", "Bilgisayar bilimi", "Elektrik mühendisliği"], boardAspectRatio: 1.6,
  items: [{ id: "local-1", type: ["d", "e"].includes(baseId(id)) ? "code" : "paragraph", semanticLabel: null, text: words[baseId(id)], latex: null, codeLanguage: ["d", "e"].includes(baseId(id)) ? "cpp" : null, linkingKey: words[baseId(id)], sourceRegion: null, mark: "VISIBLE", spatialRelationships: [], visual: null, uncertainty: null }],
  unreadableRegions: [], boardOverview: words[baseId(id)],
  visualAssessment: { boardBounds: null, readableFraction: 1, visibleBoardFraction: 1, qualityNotes: [], occlusions: [] },
});
const state = (id: string, imageIds: string[]) => ({ id, imageIds, primaryImageId: imageIds[0], reason: "Visible authored progression establishes the captured stage.", confidence: "HIGH" as const });
function organized(): PhotoOrganization {
  return {
    version: 1, mode: "AUTOMATIC", sequences: [{ id: "lecture", title: "Dersin gelişimi", orderingConfidence: "HIGH", uncertainty: null, states: [state("a", ["a", "a-copy"]), state("b", ["b", "b-angle"]), ...["c", "d", "e", "f", "g"].map((id) => state(id, [id]))] }],
    duplicateGroups: [{ imageIds: ["a", "a-copy"], primaryImageId: "a", kind: "EXACT", reason: "Exactly the same supplied pixels." }, { imageIds: ["b", "b-angle"], primaryImageId: "b", kind: "SAME_STATE", reason: "Complementary angle of the same authored equation." }],
    relationships: [
      { fromImageId: "a", toImageId: "a-copy", kind: "SAME_STATE", confidence: "HIGH", reason: "Exact pixels." },
      { fromImageId: "b", toImageId: "b-angle", kind: "SAME_STATE", confidence: "HIGH", reason: "Same visible equation from a clearer angle." },
      ...["a", "b", "c", "d", "e", "f"].map((id, index) => ({ fromImageId: id, toImageId: ["b", "c", "d", "e", "f", "g"][index], kind: "BEFORE" as const, confidence: "HIGH" as const, reason: "Visible authored additions establish a direction; this is a mocked chronology fixture." })),
    ], warnings: [],
  };
}
async function fixture() {
  const ids = ["g", "b-angle", "a-copy", "f", "c", "a", "e", "b", "d"];
  const bytes = new Map<string, string>();
  for (const [index, id] of ["a", "b", "b-angle", "c", "d", "e", "f", "g"].entries()) {
    const width = index % 2 ? 120 : 80, height = index % 2 ? 80 : 120;
    bytes.set(id, (await sharp({ create: { width, height, channels: 3, background: { r: 20 + index * 23, g: 80 + index * 5, b: 190 - index * 17 } } }).png().toBuffer()).toString("base64"));
  }
  bytes.set("a-copy", bytes.get("a")!);
  const images: VisionImage[] = ids.map((id, sequence) => ({ id, sequence, mimeType: "image/png", base64: bytes.get(id)! }));
  const calls: GenerateRequest<unknown>[] = [];
  const payloads: unknown[] = [];
  const provider: AiProvider = { id: "openai", model: "mock-photo-vision", async generate<T>(request: GenerateRequest<T>): Promise<GenerateResult<T>> {
    calls.push(request as GenerateRequest<unknown>);
    let payload: unknown;
    if (request.schemaName === "board_observation") payload = observation(request.images[0].id);
    else if (request.schemaName === "organized_photos") payload = organized();
    else if (request.schemaName === "photo_explanations") {
      const imageIds = JSON.parse(request.prompt.match(/Requested image IDs: (\[[^\n]+\])/u)![1]) as string[];
      payload = { language: "Türkçe", warnings: [], photos: imageIds.map((imageId) => ({
        imageId, heading: imageId === "a-copy" ? "" : `Konu: ${baseId(imageId)}`,
        bodyMarkdown: imageId === "a-copy" ? "Bu fotoğraf önceki tahta içeriğini tekrar ediyor." : ["d", "e"].includes(imageId) ? `Önceki adımı izleyerek bağlı liste güncellenir.\n\n\`\`\`cpp\n${words[imageId]}\n\`\`\`` : imageId === "b-angle" ? "Bu daha net açı, integral çarpanındaki üstel ifadeyi doğruluyor." : `${words[imageId]}\n\nBu adım önceki görünür içeriğin devamını açıklar.\n\n$$\\mu(x)=e^{\\int p(x)\\,dx}$$`,
        relation: imageId === "a-copy" ? "REPEAT" : imageId === "b-angle" ? "COMPLEMENTARY" : imageId === "c" ? "CORRECTION" : imageId === "a" ? "INITIAL" : "CONTINUATION",
        evidenceStatus: "DERIVED", uncertainty: null, sourceImageIds: [imageId],
      })) };
    } else throw new Error(`Unexpected canvas generation request: ${request.schemaName}`);
    payloads.push(payload);
    return { rawOutput: JSON.stringify(payload), structuredOutput: request.schema!.parse(request.normalizeOutput ? request.normalizeOutput(payload) : payload), model: "returned-photo-vision-model" };
  } };
  return { images, calls, payloads, provider };
}

describe("photo-first contextual lecture explanations", () => {
  it("organizes nine shuffled original photos and gives each its own contextual Turkish explanation without any canvas request", async () => {
    const { images, calls, provider } = await fixture();
    const result = await explainWithProvider({ lesson, images }, provider);
    expect(result.document.photos.map((photo) => photo.imageId)).toEqual(["a", "a-copy", "b", "b-angle", "c", "d", "e", "f", "g"]);
    expect(result.document.photos).toHaveLength(9);
    expect(result.document.language).toBe("Türkçe");
    expect(result.document.photos.every((photo) => photo.sourceImageIds.includes(photo.imageId))).toBe(true);
    expect(result.document.photos[1].relation).toBe("REPEAT");
    expect(result.document.photos[1].bodyMarkdown.length).toBeLessThan(90);
    expect(result.document.photos[3].relation).toBe("COMPLEMENTARY");
    expect(result.document.photos[4].relation).toBe("CORRECTION");
    expect(result.document.photos[5].bodyMarkdown).toContain("```cpp");
    expect(result.document.photos[0].bodyMarkdown).toContain("$$");
    expect(result.document.photos.every((photo) => !("layout" in photo) && !("sourceRegion" in photo))).toBe(true);
    expect(calls.filter((call) => call.schemaName === "board_observation")).toHaveLength(8); // Exact pixels reuse observation, never delete its original.
    expect(calls.filter((call) => call.schemaName === "photo_explanations")).toHaveLength(7);
    expect(calls.some((call) => call.schemaName === "reconstructed_lesson")).toBe(false);
    expect(calls.filter((call) => call.schemaName === "photo_explanations").every((call) => call.images.length <= 5)).toBe(true);
    const c = calls.find((call) => call.schemaName === "photo_explanations" && call.prompt.includes('Requested image IDs: ["c"]'))!;
    expect(c.prompt).toContain("İntegral çarpanı");
    expect(c.prompt).toContain("Earlier explanations in THIS sequence");
  });

  it("reuses all valid explanation checkpoints on retry and reuses extraction/organization when manual order changes context", async () => {
    const { images, calls, provider } = await fixture();
    const values = new Map<string, unknown>();
    const cache = { get: async (key: string) => values.get(key) || null, set: async (key: string, value: unknown) => { values.set(key, value); } };
    const first = await explainWithProvider({ lesson, images, cache }, provider);
    const count = calls.length;
    const rerun = await explainWithProvider({ lesson, images: [...images].reverse(), cache }, provider);
    expect(calls).toHaveLength(count);
    expect(rerun.document).toEqual(first.document);
    await explainWithProvider({ lesson, images, cache, organizationMode: "MANUAL" }, provider);
    expect(calls.slice(count).every((call) => call.schemaName === "photo_explanations")).toBe(true);
    expect(calls.slice(count)).toHaveLength(9); // One photograph per explicitly corrected manual moment.
  });

  it("rejects a fabricated explanation source without saving it as a valid checkpoint", async () => {
    const context = await fixture();
    const generate = context.provider.generate.bind(context.provider);
    context.provider.generate = async <T,>(request: GenerateRequest<T>) => {
      const response = await generate(request);
      if (request.schemaName === "photo_explanations") {
        const changed = response.structuredOutput as { photos: { sourceImageIds: string[] }[] };
        changed.photos[0].sourceImageIds = ["foreign-photo"];
      }
      return response;
    };
    await expect(explainWithProvider({ lesson, images: context.images }, context.provider)).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
  });

  it("briefens long model-confirmed Turkish repeats without changing complementary content or invalidating any cached batch", async () => {
    const context = await fixture();
    const generate = context.provider.generate.bind(context.provider);
    const repeatedBody = "Bu fotoğraf önceki tahta içeriğini tekrar ediyor. " + "Aynı içeriğin uzun ve gereksiz yeniden açıklaması. ".repeat(25);
    const complementaryBody = "Bu farklı açı daha önce okunamayan ek bilgiyi gösterir. " + "Yeni okunabilen akademik ayrıntı korunmalıdır. ".repeat(25);
    context.provider.generate = async <T,>(request: GenerateRequest<T>) => {
      const response = await generate(request);
      if (request.schemaName === "photo_explanations") {
        const changed = response.structuredOutput as { photos: { imageId: string; bodyMarkdown: string; uncertainty: string | null }[] };
        for (const photo of changed.photos) {
          if (photo.imageId === "a-copy") { photo.bodyMarkdown = repeatedBody; photo.uncertainty = "Tekrarlanan fotoğraftaki küçük yazı net değil."; }
          if (photo.imageId === "b-angle") photo.bodyMarkdown = complementaryBody;
        }
      }
      return response;
    };
    const values = new Map<string, unknown>();
    const cache = { get: async (key: string) => values.get(key) || null, set: async (key: string, value: unknown) => { values.set(key, value); } };
    const first = await explainWithProvider({ lesson, images: context.images, cache }, context.provider);
    const repeat = first.document.photos.find((photo) => photo.imageId === "a-copy")!;
    expect(repeat.bodyMarkdown).toContain("Bu fotoğraf");
    expect(repeat.bodyMarkdown.length).toBeLessThan(450);
    expect(repeat.uncertainty).toBe("Tekrarlanan fotoğraftaki küçük yazı net değil.");
    expect(repeat.sourceImageIds).toEqual(["a-copy"]);
    expect(first.document.photos.find((photo) => photo.imageId === "b-angle")!.bodyMarkdown).toBe(complementaryBody);
    const saved = [...values.values()] as { structuredOutput?: { photos?: { imageId: string; bodyMarkdown: string }[] } }[];
    expect(saved.flatMap((entry) => entry.structuredOutput?.photos || []).find((photo) => photo.imageId === "a-copy")!.bodyMarkdown).toBe(repeatedBody);
    const laterPrompt = context.calls.find((call) => call.schemaName === "photo_explanations" && call.prompt.includes('Requested image IDs: ["c"]'))!;
    expect(laterPrompt.prompt).toContain(repeatedBody);
    const calls = context.calls.length;
    const rerun = await explainWithProvider({ lesson, images: context.images, cache }, context.provider);
    expect(context.calls).toHaveLength(calls);
    expect(rerun.document).toEqual(first.document);
  });

  it("keeps independent sequences uncertain and never supplies earlier unrelated explanations as context", async () => {
    const context = await fixture();
    const generate = context.provider.generate.bind(context.provider);
    context.provider.generate = async <T,>(request: GenerateRequest<T>) => {
      const response = await generate(request);
      if (request.schemaName === "organized_photos") {
        const output = response.structuredOutput as PhotoOrganization;
        const last = output.sequences[0].states.pop()!;
        output.sequences.push({ id: "independent", title: "Bağımsız konu", orderingConfidence: "LOW", uncertainty: "Bu fotoğrafın önceki konuyla kronolojik ilişkisi bilinmiyor.", states: [last] });
        output.relationships = output.relationships.filter((edge) => edge.toImageId !== "g");
      }
      return response;
    };
    const result = await explainWithProvider({ lesson, images: context.images }, context.provider);
    expect(result.document.photos.at(-1)!.uncertainty).toContain("bilinmiyor");
    const final = context.calls.findLast((call) => call.schemaName === "photo_explanations")!;
    expect(final.prompt).toContain("Earlier explanations in THIS sequence: []");
    expect(final.images.map((image) => image.id)).toEqual(["g"]);
  });
});
