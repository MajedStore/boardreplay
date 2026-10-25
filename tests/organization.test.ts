import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { reconstructWithProvider } from "../lib/ai";
import { applyManualPhotoOrder, validatePhotoOrganization } from "../lib/ai/organization";
import { aiBoardElementSchema, aiReconstructionSchema, photoObservationSchema, type ImageExtraction } from "../lib/ai/wire-schemas";
import type { AiProvider, GenerateRequest, GenerateResult, VisionImage } from "../lib/ai/contracts";
import type { BoardChange, PhotoOrganization } from "../lib/types";
import { getBoardScene } from "../lib/board/scene";
import { analyzePhotoMetrics } from "../lib/photos/metrics";
import { AiError } from "../lib/ai/errors";

const lesson = { title: "Authored mixed university lecture fixture", course: "Data structures", topic: "Insertion", language: "Original language", instructions: "" };
const assessment = { boardBounds: { x: .02, y: .03, width: .96, height: .94 }, readableFraction: 1, visibleBoardFraction: 1, qualityNotes: [] as string[], occlusions: [] as Array<{kind: "PERSON"; region: {x:number;y:number;width:number;height:number};description:string}> };
const xml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
async function photographed(id: string, sequence: number, lines: string[], nodes = 3, obscured = false, angle = false): Promise<VisionImage> {
  const diagram = Array.from({ length: nodes }, (_, index) => `<rect x="${115 + index * 180}" y="170" width="110" height="60" fill="none" stroke="#31566c" stroke-width="3"/><text x="${140 + index * 180}" y="208" font-size="25">${index + 1} | next</text>${index < nodes - 1 ? `<path d="M${225 + index * 180} 200h70l-12 -8m12 8l-12 8" fill="none" stroke="#31566c" stroke-width="3"/>` : ""}`).join("");
  const svg = `<svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="800" fill="#edf0ed"/><rect x="25" y="25" width="1150" height="750" rx="5" fill="#fffefa" stroke="#8b9a98" stroke-width="5"/><g font-family="Arial" fill="#244655" transform="${angle ? "translate(15 5) skewX(-1)" : ""}"><text x="85" y="100" font-size="34">University board capture</text>${diagram}${lines.map((line, index) => `<text x="85" y="${340 + index * 54}" font-size="29" font-family="Consolas, monospace">${xml(line)}</text>`).join("")}</g>${obscured ? '<g fill="#4a535b"><circle cx="200" cy="305" r="58"/><path d="M130 370Q200 330 270 370L300 760H100Z"/></g>' : ""}</svg>`;
  const bytes = await sharp(Buffer.from(svg)).png().toBuffer();
  return { id, sequence, mimeType: "image/png", base64: bytes.toString("base64") };
}
function observed(image: VisionImage, lines: string[], obscured = false): ImageExtraction {
  return { ...photoObservationSchema.parse({
    language: "English", boardState: "CONTENT", disciplines: ["Computer science"], boardAspectRatio: 1.6,
    boardOverview: "Authored source content, not a measured vision result.", unreadableRegions: obscured ? ["A person blocks the left board region."] : [],
    items: lines.map((text, index) => ({ id: `item-${index}`, type: text.includes("->") ? "code" : "paragraph", semanticLabel: null, text, latex: null, codeLanguage: text.includes("->") ? "cpp" : null, linkingKey: text, sourceRegion: { x: .06, y: .4 + index * .065, width: .86, height: .06 }, mark: "VISIBLE", spatialRelationships: [], visual: null, uncertainty: null })),
    visualAssessment: obscured ? { ...assessment, readableFraction: .65, visibleBoardFraction: .7, occlusions: [{ kind: "PERSON", region: { x: .08, y: .3, width: .18, height: .64 }, description: "A person blocks visible board area; no erasure is established." }] } : assessment,
  }), imageId: image.id, sequence: image.sequence };
}
function element(id: string, text: string, source: string, type = "paragraph") {
  return aiBoardElementSchema.parse({ id, text, type, semanticLabel: null, latex: null, codeLanguage: type === "code" ? "cpp" : null,
    layout: { x: .07, y: .35, width: .86, height: .22 }, layoutBasis: "SOURCE_ESTIMATED", sourceImageIds: [source], sourceRegion: null,
    evidenceStatus: "OBSERVED", uncertainty: null, visual: null });
}
const add = (value: ReturnType<typeof element>): BoardChange => ({ id: `add-${value.id}`, action: "ADD", targetId: null, element: value, description: "The authored fixture visibly contains this content." });
const change = (action: "MODIFY" | "CORRECT", value: ReturnType<typeof element>): BoardChange => ({ id: `${action}-${value.id}`, action, targetId: value.id, element: value, description: "The authored later capture visibly changes this content." });
function state(id: string, imageIds: string[], primaryImageId = imageIds[0]) { return { id, imageIds, primaryImageId, reason: "Visible overlapping content establishes this photographed board state.", confidence: "HIGH" as const }; }
function relation(fromImageId: string, toImageId: string, kind: PhotoOrganization["relationships"][number]["kind"] = "BEFORE") { return { fromImageId, toImageId, kind, confidence: "HIGH" as const, reason: kind === "SAME_STATE" ? "Visible alignment establishes the same state with an alternative angle or occlusion." : "Visible writing and connection changes establish this direction." }; }
function contextOf(request: GenerateRequest<unknown>) { return JSON.parse(request.prompt.split("INCREMENTAL STATE CONTEXT: ")[1].split("\nReturn")[0]); }
function scripted(organization: PhotoOrganization, observations: Map<string, ImageExtraction>, events: (stateId: string, context: ReturnType<typeof contextOf>) => BoardChange[], calls: GenerateRequest<unknown>[] = []): AiProvider {
  return { id: "openai", model: "mock-semantic-vision", async generate<T>(request: GenerateRequest<T>): Promise<GenerateResult<T>> {
    calls.push(request as GenerateRequest<unknown>);
    let payload: unknown;
    if (request.schemaName === "board_observation") payload = Object.fromEntries(Object.entries(observations.get(request.images[0].id)!).filter(([key]) => !["imageId", "sequence"].includes(key)));
    else if (request.schemaName === "organized_photos") payload = organization;
    else {
      const context = contextOf(request);
      payload = { schemaVersion: 2, title: lesson.title, overview: "Authored captured states.", disciplines: ["Computer science", "Mathematics"], board: { aspectRatio: 1.6 }, concepts: [], sections: [{ id: "section", title: "Captured board" }], unresolved: [], steps: [{ id: "state", type: "other", sectionId: "section", text: "A captured source state.", latex: null, stepIndex: context.momentIndex, sourceImageIds: context.state.imageIds, evidenceStatus: "OBSERVED", uncertainty: null, originalText: null, explanation: false, changes: events(context.state.id, context) }] };
    }
    return { rawOutput: JSON.stringify(payload), structuredOutput: request.schema!.parse(request.normalizeOutput ? request.normalizeOutput(payload) : payload), model: "returned-mock-vision-model" };
  } };
}
async function ninePhotos() {
  const lines = {
    a: ["struct Node { int value; Node* next; };", "n->next = nullptr;"],
    b: ["struct Node { int value; Node* next; };", "n->next = nullptr;", "Node* n = new Node{20, nullptr};"],
    c: ["struct Node { int value; Node* next; };", "n->next = nullptr;", "T(n) = n"],
    d: ["struct Node { int value; Node* next; };", "n->next = head->next;", "T(n) = n + 1"],
    e: ["New board: RC circuit", "tau = R C"],
    f: ["Economics: output and cost", "Year | Output", "2024 | 120"],
  };
  const a = await photographed("a", 5, lines.a);
  const photos = [await photographed("c-covered", 0, lines.c.slice(1), 5, true), await photographed("f", 1, lines.f), await photographed("b-angle", 2, lines.b, 5, false, true), { ...a, id: "a-copy", sequence: 3 }, await photographed("d", 4, lines.d, 5), a, await photographed("e", 6, lines.e), await photographed("b", 7, lines.b, 5), await photographed("c", 8, lines.c, 5)];
  const observations = new Map(photos.map((image) => {
    const key = image.id[0] as keyof typeof lines;
    return [image.id, observed(image, image.id === "c-covered" ? lines.c.slice(1) : lines[key], image.id === "c-covered")];
  }));
  const organization: PhotoOrganization = { version: 1, mode: "AUTOMATIC", warnings: [], sequences: [
    { id: "linked-list", title: "Linked-list insertion", orderingConfidence: "HIGH", uncertainty: null, states: [state("first", ["a", "a-copy"]), state("expanded", ["b", "b-angle"]), state("equation", ["c", "c-covered"]), state("correction", ["d"])] },
    { id: "circuit", title: "A cleared board with RC material", orderingConfidence: "LOW", uncertainty: "The cleared board does not establish its chronological relation to the linked-list sequence.", states: [state("circuit", ["e"])] },
    { id: "economics", title: "An unrelated economics lecture", orderingConfidence: "LOW", uncertainty: "No overlapping content establishes its relationship to the other board.", states: [state("table", ["f"])] },
  ], duplicateGroups: [{ imageIds: ["a", "a-copy"], primaryImageId: "a", kind: "EXACT", reason: "Identical captured pixels." }, { imageIds: ["b", "b-angle"], primaryImageId: "b", kind: "SAME_STATE", reason: "Same content from a different camera angle." }], relationships: [relation("a", "a-copy", "SAME_STATE"), relation("b", "b-angle", "SAME_STATE"), relation("c", "c-covered", "SAME_STATE"), relation("a", "b"), relation("b", "c"), relation("c", "d"), relation("d", "e", "UNCERTAIN"), relation("e", "f", "UNRELATED")] };
  function events(id: string) {
    if (id === "first") return [add(element("diagram", "Linked list with three nodes", "a", "image_crop")), add(element("code", "n->next = nullptr;", "a", "code"))];
    if (id === "expanded") return [change("MODIFY", element("diagram", "Linked list with five nodes", "b", "image_crop"))];
    if (id === "equation") return [add({ ...element("cost", "T(n) = n", "c", "equation"), latex: "T(n)=n" })];
    if (id === "correction") return [change("CORRECT", { ...element("cost", "T(n) = n + 1", "d", "equation"), latex: "T(n)=n+1" }), change("CORRECT", element("code", "n->next = head->next;", "d", "code"))];
    if (id === "circuit") return [add({ ...element("circuit", "RC diagram: review the original connections", "e", "image_crop"), evidenceStatus: "UNCERTAIN", uncertainty: "Connection endpoints need source review." })];
    return [add(element("table", "|Year|Output|\n|---|---|\n|2024|120|", "f", "table"))];
  }
  const metrics = await Promise.all(photos.map((image) => analyzePhotoMetrics({ imageId: image.id, prepared: Buffer.from(image.base64, "base64") })));
  return { photos, observations, organization, events, metrics };
}

describe("automatic organization with real pixel fixtures and mocked semantic vision", () => {
  it("keeps nine verified elements and shows the current photo when twenty-five local IDs are incorrectly emitted as unchanged replay targets", async () => {
    const photos = await Promise.all([9, 25].map(async (count, sequence) => {
      const grid = Array.from({ length: count }, (_, index) => `<g transform="translate(${40 + index % 5 * 210} ${40 + Math.floor(index / 5) * 145})"><rect width="185" height="115" fill="none" stroke="#34495e"/><text x="15" y="65" font-size="24">item${index + 1}</text></g>`).join("");
      const bytes = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="800"><rect width="1100" height="800" fill="white"/>${grid}</svg>`)).png().toBuffer();
      return { id: sequence ? "expanded-photo" : "initial-photo", sequence, mimeType: "image/png", base64: bytes.toString("base64") };
    }));
    const observations = new Map(photos.map((photo, index) => {
      const observation = observed(photo, ["item1"]);
      observation.items = Array.from({ length: index ? 25 : 9 }, (_, itemIndex) => ({ ...structuredClone(observation.items[0]), id: `item${itemIndex + 1}`, text: `item${itemIndex + 1}`, sourceRegion: null }));
      return [photo.id, observation] as const;
    }));
    observations.get(photos[1].id)!.items[0].spatialRelationships = [{ relation: "LEFT_OF", targetId: "item2", uncertainty: null }];
    observations.get(photos[1].id)!.items[24].visual = { shape: "arrow", fromId: "item1", toId: "item2", points: [], label: "Visible relation" };
    const organization: PhotoOrganization = { version: 1, mode: "AUTOMATIC", warnings: [], duplicateGroups: [], sequences: [{ id: "s", title: "Expanding node grid", orderingConfidence: "HIGH", uncertainty: null, states: [state("initial", [photos[0].id]), state("expanded", [photos[1].id])] }], relationships: [relation(photos[0].id, photos[1].id)] };
    const calls: GenerateRequest<unknown>[] = [];
    const result = await reconstructWithProvider({ lesson, images: photos }, scripted(organization, observations, (id) => id === "initial" ? Array.from({ length: 9 }, (_, index) => add(element(`item${index + 1}`, `item${index + 1}`, photos[0].id))) : Array.from({ length: 25 }, (_, index) => ({ id: `unchanged-${index}`, action: "UNCHANGED", targetId: `item${index + 1}`, element: null, description: "An authored invalid local-ID transition fixture." })), calls));
    expect(calls).toHaveLength(5); // Two observations, organization, two states; unknown no-ops do not cause paid retries.
    const later = result.reconstruction.steps[1];
    expect(later.changes!.filter((event) => event.action === "UNCHANGED")).toHaveLength(9);
    expect(later.evidenceStatus).toBe("UNCERTAIN");
    const scene = getBoardScene(result.reconstruction, 1).elements;
    expect(scene.filter((item) => /^item\d+$/.test(item.id))).toHaveLength(9);
    const fallback = scene.filter((item) => item.type === "image_crop");
    expect(fallback).toHaveLength(1);
    expect(fallback[0]).toMatchObject({ sourceImageIds: [photos[1].id], sourceRegion: null, layoutBasis: "AUTO_LAYOUT", evidenceStatus: "UNCERTAIN" });
    expect(result.reconstruction.unresolved.join(" ")).toContain("UNKNOWN_UNCHANGED");
    const prompt = calls.filter((call) => call.schemaName === "reconstructed_lesson")[1].prompt;
    expect(prompt).toContain('"id":"photo:expanded-photo:item25"');
    expect(prompt).toContain('"targetId":"photo:expanded-photo:item2"');
    expect(prompt).toContain('"fromId":"photo:expanded-photo:item1"');
    expect(prompt).toContain("may target ONLY exact stable IDs present in priorScene");
    expect(observations.get(photos[1].id)!.items[24].id).toBe("item25");
    expect(result.extractions[1].items[0].spatialRelationships[0].targetId).toBe("item2");
  });

  it("completes nine-photo reconstruction with invalid, missing, and slightly overflowing optional source boxes without extra AI calls", async () => {
    const fixture = await ninePhotos();
    const invalid: unknown[] = [
      { x: -.2, y: .1, width: .4, height: .2 },
      { x: .9, y: .1, width: .2, height: .2 },
      { x: .9, y: .1, width: .10005, height: .2 },
      undefined,
      null,
      { x: .1, y: .1, height: .2 },
      { x: NaN, y: .1, width: .3, height: .2 },
      { x: 120, y: 60, width: 300, height: 90 },
      { x: .1, y: .1, width: 0, height: .2 },
    ];
    const originalText = new Map([...fixture.observations].map(([id, observation]) => [id, observation.items.map((item) => item.text)]));
    [...fixture.observations.values()].forEach((observation, index) => {
      Object.assign(observation.items[0], { sourceRegion: invalid[index] });
      if (index === 0) Object.assign(observation.visualAssessment!, { boardBounds: { x: .9, y: .1, width: .4, height: .2 } });
    });
    const calls: GenerateRequest<unknown>[] = [];
    const result = await reconstructWithProvider({ lesson, images: fixture.photos, photoMetrics: fixture.metrics }, scripted(fixture.organization, fixture.observations, (id) => fixture.events(id).map((event) => {
      if (event.element) event.element.sourceRegion = { imageId: event.element.sourceImageIds[0], x: .95, y: .2, width: .3, height: .2 };
      return event;
    }), calls));
    expect(calls).toHaveLength(15); // Eight distinct observations, one organization, six states; no coordinate retries.
    expect(result.reconstruction.steps).toHaveLength(6);
    for (const observation of result.extractions) expect(observation.items.map((item) => item.text)).toEqual(originalText.get(observation.imageId));
    expect(result.reconstruction.unresolved.join(" ")).toContain("[Source recovery:");
    expect(result.reconstruction.steps.flatMap((step) => step.changes || []).every((event) => !event.element || event.element.sourceRegion === null)).toBe(true);
    expect(getBoardScene(result.reconstruction, 3).elements.find((item) => item.id === "code")?.text).toBe("n->next = head->next;");
  });

  it("organizes nine randomly uploaded photographs, preserves differences/occlusion/corrections, and keeps every original citation", async () => {
    const fixture = await ninePhotos();
    const calls: GenerateRequest<unknown>[] = [], stages: string[] = [];
    const result = await reconstructWithProvider({ lesson, images: fixture.photos, photoMetrics: fixture.metrics, onStage: (stage) => { stages.push(stage); } }, scripted(fixture.organization, fixture.observations, fixture.events, calls));
    expect(result.extractions).toHaveLength(9);
    expect(calls.filter((call) => call.schemaName === "board_observation")).toHaveLength(8); // Exact copied pixels reuse the observation, not a semantic guess.
    expect(calls.filter((call) => call.schemaName === "organized_photos")).toHaveLength(1);
    expect(stages).toEqual(["ANALYZING", "FINDING_DUPLICATES", "ORGANIZING", "RECONSTRUCTING"]);
    expect(result.organization.sequences.flatMap((sequence) => sequence.states.map((state) => state.primaryImageId))).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(result.reconstruction.steps).toHaveLength(6);
    expect(new Set(result.reconstruction.steps.flatMap((moment) => moment.sourceImageIds))).toEqual(new Set(fixture.photos.map((image) => image.id)));
    expect(getBoardScene(result.reconstruction, 0).elements.find((item) => item.id === "code")?.text).toBe("n->next = nullptr;");
    expect(getBoardScene(result.reconstruction, 2).elements.find((item) => item.id === "code")?.text).toBe("n->next = nullptr;");
    expect(getBoardScene(result.reconstruction, 2).elements.find((item) => item.id === "cost")?.latex).toBe("T(n)=n");
    expect(result.reconstruction.steps[2].changes?.some((change) => change.action === "ERASE")).toBe(false);
    expect(getBoardScene(result.reconstruction, 3).elements.find((item) => item.id === "code")?.text).toBe("n->next = head->next;");
    expect(getBoardScene(result.reconstruction, 3).elements.find((item) => item.id === "cost")?.latex).toBe("T(n)=n+1");
    expect(result.reconstruction.steps[4].changes?.[0].action).toBe("NEW_TOPIC");
    expect(result.reconstruction.steps[4].evidenceStatus).toBe("UNCERTAIN");
    expect(getBoardScene(result.reconstruction, 4).elements.some((item) => item.id === "code")).toBe(false);
    expect(getBoardScene(result.reconstruction, 5).elements[0].type).toBe("table");
    expect(result.organization.duplicateGroups.find((group) => group.kind === "EXACT")?.imageIds).toEqual(["a", "a-copy"]);
  });

  it("caches successful per-photo, grouping, and state checkpoints without repeating provider calls", async () => {
    const fixture = await ninePhotos();
    const values = new Map<string, unknown>(), calls: GenerateRequest<unknown>[] = [];
    const cache = { async get(key: string) { return values.get(key) ?? null; }, async set(key: string, value: unknown) { values.set(key, value); } };
    const provider = scripted(fixture.organization, fixture.observations, fixture.events, calls);
    const first = await reconstructWithProvider({ lesson, images: fixture.photos, photoMetrics: fixture.metrics, cache }, provider);
    const requests = calls.length;
    const second = await reconstructWithProvider({ lesson, images: fixture.photos, photoMetrics: fixture.metrics, cache }, provider);
    expect(calls).toHaveLength(requests);
    expect(second.reconstruction).toEqual(first.reconstruction);
    const rearranged = [...fixture.photos].reverse().map((image, sequence) => ({ ...image, sequence }));
    const third = await reconstructWithProvider({ lesson, images: rearranged, photoMetrics: [...fixture.metrics].reverse(), cache }, provider);
    expect(calls).toHaveLength(requests);
    expect(third.reconstruction).toEqual(first.reconstruction);
    expect(values.size).toBe(15);
  });

  it("repairs an inconsistent incremental state once, records its rejected output, and reuses every completed checkpoint", async () => {
    const fixture = await ninePhotos();
    const values = new Map<string, unknown>(), calls: GenerateRequest<unknown>[] = [];
    const cache = { async get(key: string) { return values.get(key) ?? null; }, async set(key: string, value: unknown) { values.set(key, value); } };
    const provider = scripted(fixture.organization, fixture.observations, fixture.events, calls);
    const generate = provider.generate.bind(provider);
    let invalidOnce = true;
    provider.generate = async <T>(request: GenerateRequest<T>) => {
      const response = await generate(request);
      if (invalidOnce && request.schemaName === "reconstructed_lesson" && contextOf(request).momentIndex === 1) {
        invalidOnce = false;
        const output = structuredClone(response.structuredOutput) as ReturnType<typeof aiReconstructionSchema.parse>;
        output.steps[0].changes[0].action = "ADD";
        output.steps[0].changes[0].targetId = null; // Existing diagram identity must use MODIFY, never ADD.
        return { ...response, structuredOutput: output as T };
      }
      return response;
    };
    const result = await reconstructWithProvider({ lesson, images: fixture.photos, photoMetrics: fixture.metrics, cache }, provider);
    expect(result.reconstruction.steps).toHaveLength(6);
    expect(calls).toHaveLength(16); // One semantic repair, never reread the observations or organization.
    const repair = calls.find((call) => call.prompt.includes("previous state failed a consistency check"));
    expect(repair?.prompt).toContain("ADD requires a never-used element ID and no target.");
    const diagnostics = [...values].filter(([key]) => key.startsWith("diagnostic:"));
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0][1]).toMatchObject({ stage: "state", source: "PROVIDER", attempt: 1, diagnostic: { code: "STATE_CONSISTENCY", message: "ADD requires a never-used element ID and no target." }, structuredOutput: { steps: [{ changes: [{ action: "ADD" }] }] } });
    expect([...values.keys()].filter((key) => !key.startsWith("diagnostic:"))).toHaveLength(15);
    await reconstructWithProvider({ lesson, images: fixture.photos, photoMetrics: fixture.metrics, cache }, provider);
    expect(calls).toHaveLength(16);
  });

  it("chooses a fixed canvas ratio from the organized primary rather than the first uploaded crop", async () => {
    const fixture = await ninePhotos();
    fixture.observations.get("a")!.boardAspectRatio = 2.2;
    fixture.observations.get("a-copy")!.boardAspectRatio = 2.2;
    fixture.observations.get("c-covered")!.boardAspectRatio = .6;
    fixture.observations.get("f")!.boardAspectRatio = .9;
    const calls: GenerateRequest<unknown>[] = [];
    const first = await reconstructWithProvider({ lesson, images: fixture.photos, photoMetrics: fixture.metrics }, scripted(fixture.organization, fixture.observations, fixture.events, calls));
    const reordered = [...fixture.photos].reverse().map((image, sequence) => ({ ...image, sequence }));
    const second = await reconstructWithProvider({ lesson, images: reordered, photoMetrics: fixture.metrics }, scripted(fixture.organization, fixture.observations, fixture.events, calls));
    expect(first.reconstruction.board?.aspectRatio).toBe(2.2);
    expect(second.reconstruction.board).toEqual(first.reconstruction.board);
    for (const call of calls.filter((call) => call.schemaName === "reconstructed_lesson")) {
      expect(contextOf(call).boardAspectRatio).toBe(2.2);
      expect(call.prompt).toContain("fixed digital canvas has aspectRatio=2.2");
    }
  });

  it("does not merge a nearly identical capture containing an additional equation", async () => {
    const first = await photographed("start", 1, ["n->next = head->next;"]);
    const second = await photographed("added", 0, ["n->next = head->next;", "T(n) = n + 1"]);
    const organization: PhotoOrganization = { version: 1, mode: "AUTOMATIC", warnings: [], duplicateGroups: [{ imageIds: ["start", "added"], primaryImageId: "added", kind: "POSSIBLE", reason: "Nearly identical photos contain an important added expression." }], sequences: [{ id: "s", title: "Insertion cost", orderingConfidence: "HIGH", uncertainty: null, states: [state("start", ["start"]), state("added", ["added"])] }], relationships: [relation("start", "added")] };
    const result = await reconstructWithProvider({ lesson, images: [second, first] }, scripted(organization, new Map([["start", observed(first, ["n->next = head->next;"])], ["added", observed(second, ["n->next = head->next;", "T(n) = n + 1"])]]), (id) => id === "start" ? [add(element("code", "n->next = head->next;", "start", "code"))] : [add({ ...element("cost", "T(n) = n + 1", "added", "equation"), latex: "T(n)=n+1" })]));
    expect(result.reconstruction.steps).toHaveLength(2);
    expect(getBoardScene(result.reconstruction, 1).elements.map((item) => item.type)).toContain("equation");
    expect(result.organization.duplicateGroups[0].kind).toBe("POSSIBLE");
  });

  it("separates unsupported chronology and refuses overlapping-only state collapse", async () => {
    const fixture = await ninePhotos();
    const uncertain = structuredClone(fixture.organization);
    uncertain.relationships = uncertain.relationships.filter((item) => item.kind !== "BEFORE");
    const result = validatePhotoOrganization(uncertain, fixture.photos, [...fixture.observations.values()], fixture.metrics);
    expect(result.sequences).toHaveLength(6);
    expect(result.sequences.every((sequence) => sequence.orderingConfidence === "LOW")).toBe(true);
    const grouped = structuredClone(fixture.organization);
    grouped.sequences[0].states = [state("wrong-collapse", ["a", "a-copy", "b", "b-angle", "c", "c-covered", "d"])];
    grouped.relationships = [];
    expect(() => validatePhotoOrganization(grouped, fixture.photos, [...fixture.observations.values()], fixture.metrics)).toThrow(/same-state visual evidence/);
    grouped.relationships = [relation("a", "b")];
    expect(() => validatePhotoOrganization(grouped, fixture.photos, [...fixture.observations.values()], fixture.metrics)).toThrow(/meaningful progression/);
  });

  it("rejects omitted sources and cyclic chronology rather than caching a fabricated sequence", async () => {
    const fixture = await ninePhotos();
    const missing = structuredClone(fixture.organization); missing.sequences.pop();
    expect(() => validatePhotoOrganization(missing, fixture.photos, [...fixture.observations.values()], fixture.metrics)).toThrow(/omitted/);
    const cyclic = structuredClone(fixture.organization); cyclic.relationships.push(relation("d", "a"));
    expect(() => validatePhotoOrganization(cyclic, fixture.photos, [...fixture.observations.values()], fixture.metrics)).toThrow(/cycle/);
  });

  it("treats manual order as an explicit correction and keeps unrelated boards separated", async () => {
    const fixture = await ninePhotos();
    const organization = validatePhotoOrganization(fixture.organization, fixture.photos, [...fixture.observations.values()], fixture.metrics);
    const manual = applyManualPhotoOrder(organization, fixture.photos);
    expect(manual.mode).toBe("MANUAL");
    expect(manual.sequences.flatMap((sequence) => sequence.states.flatMap((state) => state.imageIds))).toEqual(fixture.photos.map((image) => image.id));
    expect(manual.sequences.length).toBeGreaterThan(1);
    expect(manual.warnings.join(" ")).toContain("Manual order");
  });

  it("merges nine complementary views through bounded calls without replaying nine duplicate moments", async () => {
    const photos = await Promise.all(Array.from({ length: 9 }, (_, index) => photographed(`view-${index}`, index, [`Visible board region ${index}`])));
    const observations = new Map(photos.map((image, index) => [image.id, observed(image, [`Visible board region ${index}`])]));
    const organization: PhotoOrganization = { version: 1, mode: "AUTOMATIC", warnings: [], duplicateGroups: [], sequences: [{ id: "whole-board", title: "Complementary photographed regions", orderingConfidence: "HIGH", uncertainty: null, states: [state("same", photos.map((image) => image.id))] }], relationships: photos.slice(1).map((image) => relation(photos[0].id, image.id, "SAME_STATE")) };
    const calls: GenerateRequest<unknown>[] = [];
    const result = await reconstructWithProvider({ lesson, images: photos }, scripted(organization, observations, (_id, context) => photos.slice(context.chunkIndex * 4, context.chunkIndex * 4 + 4).map((image, index) => add(element(`region-${context.chunkIndex}-${index}`, `Visible board region ${image.sequence}`, image.id))), calls));
    const stateCalls = calls.filter((call) => call.schemaName === "reconstructed_lesson");
    expect(stateCalls).toHaveLength(3);
    expect(stateCalls.every((call) => call.images.length <= 5)).toBe(true);
    expect(result.reconstruction.steps).toHaveLength(1);
    expect(getBoardScene(result.reconstruction, 0).elements).toHaveLength(9);
    expect(result.reconstruction.steps[0].sourceImageIds).toHaveLength(9);
  });

  it("never interprets a wholly unreadable continuation as an erasure or correction", async () => {
    const first = await photographed("clear", 0, ["Preserve the visible pointer"]);
    const hidden = { ...first, id: "blurred", sequence: 1, base64: (await sharp(Buffer.from(first.base64, "base64")).blur(25).png().toBuffer()).toString("base64") };
    const unreadable: ImageExtraction = { ...observed(hidden, []), boardState: "UNREADABLE", items: [], unreadableRegions: ["The entire photograph is too blurred to transcribe."], visualAssessment: { ...assessment, readableFraction: 0, qualityNotes: ["Severe blur"], occlusions: [{ kind: "BLUR", region: null, description: "No erasure or corrected text can be established." }] } };
    const observations = new Map([[first.id, observed(first, ["Preserve the visible pointer"])], [hidden.id, unreadable]]);
    const organization: PhotoOrganization = { version: 1, mode: "AUTOMATIC", warnings: [], duplicateGroups: [], sequences: [{ id: "s", title: "A continuation under review", orderingConfidence: "HIGH", uncertainty: null, states: [state("clear", [first.id]), state("blurred", [hidden.id])] }], relationships: [relation(first.id, hidden.id)] };
    const source = { ...element("unclear-photo", "Unreadable current photograph", hidden.id, "image_crop"), evidenceStatus: "UNCERTAIN" as const, uncertainty: "Blur prevents reliable reading; earlier visible content is preserved." };
    const provider = scripted(organization, observations, (id) => id === "clear" ? [add(element("prior-writing", "Preserve the visible pointer", first.id))] : [add(source)]);
    const result = await reconstructWithProvider({ lesson, images: [first, hidden] }, provider);
    expect(getBoardScene(result.reconstruction, 1).elements.map((item) => item.id)).toEqual(["prior-writing", "unclear-photo"]);
    for (const action of ["ERASE", "CORRECT", "MODIFY", "NEW_TOPIC"] as const) {
      const invalid: BoardChange = { id: "invented-hidden-change", action, targetId: action === "NEW_TOPIC" ? null : "prior-writing", element: ["ERASE", "NEW_TOPIC"].includes(action) ? null : element("prior-writing", "Unseen replacement", hidden.id), description: "An unsupported change behind blur." };
      await expect(reconstructWithProvider({ lesson, images: [first, hidden] }, scripted(organization, observations, (id) => id === "clear" ? [add(element("prior-writing", "Preserve the visible pointer", first.id))] : [invalid, add(source)]))).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
    }
  });

  it("normalizes cropped or occluded empty-looking photos so they cannot force a false erasure", async () => {
    const clear = await photographed("clear", 0, ["Preserve the original visible writing"]);
    for (const occluded of [false, true]) {
      const bytes = occluded
        ? await sharp(Buffer.from((await photographed("covered", 1, [], 0, true)).base64, "base64")).png().toBuffer()
        : await sharp(Buffer.from(clear.base64, "base64")).extract({ left: 950, top: 500, width: 200, height: 200 }).png().toBuffer();
      const empty = { id: "empty-looking", sequence: 1, mimeType: "image/png", base64: bytes.toString("base64") };
      const observation: ImageExtraction = { ...observed(empty, []), boardState: "BLANK", unreadableRegions: [], visualAssessment: { ...assessment, boardBounds: null, visibleBoardFraction: occluded ? 1 : .2, occlusions: occluded ? [{ kind: "PERSON", region: { x: .08, y: .3, width: .18, height: .64 }, description: "A person blocks part of the apparently empty board." }] : [] } };
      const observations = new Map([[clear.id, observed(clear, ["Preserve the original visible writing"])], [empty.id, observation]]);
      const organization: PhotoOrganization = { version: 1, mode: "AUTOMATIC", warnings: [], duplicateGroups: [], sequences: [{ id: "same-board", title: "Captured board", orderingConfidence: "HIGH", uncertainty: null, states: [state("clear", [clear.id]), state("partial", [empty.id])] }], relationships: [relation(clear.id, empty.id)] };
      const original = add(element("original-writing", "Preserve the original visible writing", clear.id));
      const crop = add({ ...element("unclear-photo", "The full board is not established as empty", empty.id, "image_crop"), evidenceStatus: "UNCERTAIN", uncertainty: "Cropped or occluded space is not proof of an erasure." });
      const result = await reconstructWithProvider({ lesson, images: [clear, empty] }, scripted(organization, observations, (id) => id === "clear" ? [original] : [crop]));
      expect(result.extractions[1].boardState).toBe("UNREADABLE");
      expect(result.extractions[1].unreadableRegions.join(" ")).toContain("cannot be treated as erased");
      expect(getBoardScene(result.reconstruction, 1).elements.find((item) => item.id === "original-writing")?.text).toBe("Preserve the original visible writing");
      const erased: BoardChange = { id: "false-erasure", action: "ERASE", targetId: "original-writing", element: null, description: "Incorrectly assumed erasure behind an obstruction." };
      await expect(reconstructWithProvider({ lesson, images: [clear, empty] }, scripted(organization, observations, (id) => id === "clear" ? [original] : [erased, crop]))).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
    }
  });

  it("reuses completed analysis after a provider capacity failure without caching incomplete reconstruction", async () => {
    const fixture = await ninePhotos();
    const values = new Map<string, unknown>(), calls: GenerateRequest<unknown>[] = [];
    const cache = { async get(key: string) { return values.get(key) ?? null; }, async set(key: string, value: unknown) { values.set(key, value); } };
    const provider = scripted(fixture.organization, fixture.observations, fixture.events, calls);
    const generate = provider.generate.bind(provider);
    provider.generate = async <T>(request: GenerateRequest<T>) => {
      if (request.schemaName === "reconstructed_lesson") throw new AiError("INCOMPLETE_OUTPUT", "The provider reached its output capacity.");
      return generate(request);
    };
    await expect(reconstructWithProvider({ lesson, images: fixture.photos, photoMetrics: fixture.metrics, cache }, provider)).rejects.toMatchObject({ code: "INCOMPLETE_OUTPUT" });
    expect(values.size).toBe(9); // Eight unique images and one validated organization.
    provider.generate = generate;
    await reconstructWithProvider({ lesson, images: fixture.photos, photoMetrics: fixture.metrics, cache }, provider);
    expect(calls.filter((call) => call.schemaName === "board_observation")).toHaveLength(8);
    expect(calls.filter((call) => call.schemaName === "organized_photos")).toHaveLength(1);
    expect(values.size).toBe(15);
  });
});
