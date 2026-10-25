import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import type { LectureImage, PhotoOrganization } from "../lib/types";

const sdk = vi.hoisted(() => ({ create: vi.fn(), callbacks: [] as Array<() => void | Promise<void>> }));
vi.mock("openai", () => ({ default: class { responses = { create: sdk.create }; } }));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (callback: () => void | Promise<void>) => { sdk.callbacks.push(callback); },
}));

const token = randomUUID();
const filename = path.resolve(`data/test-source-recovery-${token}.db`);
const uploads = path.resolve(`data/test-source-recovery-uploads-${token}`);
vi.stubEnv("DATABASE_URL", `file:${filename}`);
vi.stubEnv("UPLOAD_DIR", uploads);
vi.stubEnv("OPENAI_API_KEY", "mock-no-network-source-recovery-key");
vi.stubEnv("OPENAI_MODEL", "mock-source-recovery-vision");
const { db } = await import("../lib/db");
const lessonRoutes = await import("../app/api/lessons/route");
const imageRoutes = await import("../app/api/lessons/[id]/images/route");
const imageRoute = await import("../app/api/images/[id]/route");
const processRoute = await import("../app/api/lessons/[id]/process/route");
const { getLesson } = await import("../lib/lessons");

beforeAll(() => {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const sqlite = new DatabaseSync(filename);
  for (const migration of ["20261024000000_init", "20261024010000_universal_benchmark_snapshot", "20261024020000_photo_organization", "20261025010000_photo_lecture_document"])
    sqlite.exec(fs.readFileSync(`prisma/migrations/${migration}/migration.sql`, "utf8"));
  sqlite.close();
});
afterAll(async () => {
  await db.$disconnect();
  const dataRoot = path.resolve("data") + path.sep;
  if (!filename.startsWith(dataRoot) || !uploads.startsWith(dataRoot) || !path.basename(uploads).startsWith("test-source-recovery-uploads-"))
    throw new Error("Refusing to remove an unexpected recovery fixture path.");
  for (const suffix of ["", "-wal", "-shm", "-journal"]) fs.rmSync(filename + suffix, { force: true });
  fs.rmSync(uploads, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

function jsonRequest(url: string, body: unknown, method = "POST") {
  return new Request(`http://localhost${url}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

const sources = [
  { width: 3000, height: 1800, exif: 1, rotation: 0 },
  { width: 1800, height: 3000, exif: 1, rotation: 90 },
  { width: 2600, height: 1400, exif: 6, rotation: 0 },
  { width: 1300, height: 2100, exif: 1, rotation: 180 },
  { width: 2500, height: 1500, exif: 8, rotation: 270 },
  { width: 1600, height: 2400, exif: 1, rotation: 0 },
  { width: 2400, height: 1600, exif: 3, rotation: 90 },
  { width: 900, height: 1200, exif: 2, rotation: 270 },
  { width: 2000, height: 1400, exif: 1, rotation: 0 },
];
const visibleText = (index: number) => `Captured university statement ${index + 1}: T(n) = ${index + 1}n + 1`;
const region = (index: number): unknown => [
  { x: .8, y: .2, width: .6, height: .3 }, // The reported overflow; valid content must survive.
  null,
  undefined,
  { x: -.00002, y: .2, width: .7, height: .3 }, // Repairable rounding.
  { x: .2, y: .2, width: -.3, height: .4 },
  { x: "500", y: .2, width: .3, height: .4 },
  { x: 200, y: 100, width: 300, height: 150 }, // No guessed pixel conversion.
  { x: .1, y: .2, width: .3, height: .4 },
  { x: 1.2, y: .2, width: .3, height: .4 },
][index];

interface SdkInput {
  text: { format: { name: string } };
  input: Array<{ content: Array<{ type: string; text?: string; image_url?: string }> }>;
}

describe("real upload-to-persisted replay with recoverable source geometry", () => {
  it("completes nine mixed oriented/resized photos through the actual pipeline with SDK-only fixtures and no coordinate retries", async () => {
    const created = await lessonRoutes.POST(jsonRequest("/api/lessons", { title: "Nine mixed source-region regression", course: "Authored software fixture" }));
    expect(created.status).toBe(200);
    const { id } = await created.json();
    const context = { params: Promise.resolve({ id }) };
    const upload = new FormData();
    const order = [3, 0, 8, 2, 6, 1, 5, 7, 4];
    for (const index of order) {
      const photo = sources[index];
      const lines = Array.from({ length: index + 1 }, (_, earlier) => `<text x="75" y="${150 + earlier * 85}" font-size="32">${visibleText(earlier)}</text>`).join("");
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${photo.width}" height="${photo.height}"><rect width="100%" height="100%" fill="#fffef7"/><g fill="#173a4a" font-family="Arial">${lines}</g></svg>`;
      const bytes = await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).withMetadata({ orientation: photo.exif }).toBuffer();
      upload.append("files", new File([new Uint8Array(bytes)], `synthetic-source-${index}.jpg`, { type: "image/jpeg" }));
    }
    const uploaded = await imageRoutes.POST(new Request(`http://localhost/api/lessons/${id}/images`, { method: "POST", body: upload }), context);
    expect(uploaded.status).toBe(200);
    const savedUpload = await uploaded.json();
    expect(savedUpload.images).toHaveLength(9);
    const photographs = new Map<number, LectureImage>();
    for (const image of savedUpload.images as LectureImage[]) {
      const index = Number(image.originalFilename.match(/source-(\d+)/)![1]);
      photographs.set(index, image);
      const changed = await imageRoute.PATCH(jsonRequest(`/api/images/${image.id}`, { rotation: sources[index].rotation }, "PATCH"), { params: Promise.resolve({ id: image.id }) });
      expect(changed.status).toBe(200);
    }
    const byId = new Map([...photographs].map(([index, image]) => [image.id, index]));
    const ids = [...photographs].sort(([a], [b]) => a - b).map(([, image]) => image.id);
    const organization: PhotoOrganization = {
      version: 1, mode: "AUTOMATIC", warnings: [], duplicateGroups: [],
      sequences: [{ id: "progression", title: "Authored photographed additions", orderingConfidence: "HIGH", uncertainty: null,
        states: ids.map((imageId, index) => ({ id: `state-${index}`, imageIds: [imageId], primaryImageId: imageId, reason: "Authored SDK response: additional visible statement.", confidence: "HIGH" })) }],
      relationships: ids.slice(1).map((imageId, index) => ({ fromImageId: ids[index], toImageId: imageId, kind: "BEFORE", confidence: "HIGH", reason: "The authored fixture retains prior statements and adds one." })),
    };
    const preparedDimensions = new Map<string, { width: number; height: number }>();
    let sawPersistedExtractions = false;
    sdk.create.mockImplementation(async (input: SdkInput) => {
      const content = input.input[0].content;
      const prompt = content.find((item) => item.type === "input_text")!.text!;
      const name = input.text.format.name;
      let payload: unknown;
      if (name === "board_observation") {
        const imageId = content.find((item) => item.type === "input_text" && item.text?.includes("image ID: "))!.text!.split("image ID: ")[1];
        const index = byId.get(imageId)!;
        const jpeg = content.find((item) => item.type === "input_image")!.image_url!.split(",")[1];
        const metadata = await sharp(Buffer.from(jpeg, "base64")).metadata();
        preparedDimensions.set(imageId, { width: metadata.width!, height: metadata.height! });
        const observed = { id: "captured-statements", type: "paragraph", semanticLabel: null, text: Array.from({ length: index + 1 }, (_, earlier) => visibleText(earlier)).join("\n"), latex: null, codeLanguage: null, linkingKey: "visible-statements", ...(region(index) !== undefined ? { sourceRegion: region(index) } : {}), mark: "VISIBLE", spatialRelationships: [], visual: null, uncertainty: null };
        payload = { language: "English", boardState: "CONTENT", disciplines: ["Computer science"], boardAspectRatio: 1.6, items: [observed], unreadableRegions: [], boardOverview: "Authored photograph content; SDK is mocked.",
          visualAssessment: { boardBounds: index === 4 ? { x: -.5, y: 0, width: 1, height: 1 } : null, readableFraction: 1, visibleBoardFraction: 1, qualityNotes: [], occlusions: [] } };
      } else if (name === "organized_photos") {
        expect(await db.extractionResult.count({ where: { run: { lessonId: id } } })).toBe(9);
        sawPersistedExtractions = true;
        payload = organization;
      } else {
        expect(name).toBe("photo_explanations");
        const requested = JSON.parse(prompt.split("Requested image IDs: ")[1].split("\n")[0]) as string[];
        payload = { language: "English", warnings: [], photos: requested.map((imageId) => ({ imageId, heading: "University statement", bodyMarkdown: visibleText(byId.get(imageId)!), relation: byId.get(imageId) === 0 ? "INITIAL" : "CONTINUATION", evidenceStatus: "DERIVED", uncertainty: null, sourceImageIds: [imageId] })) };
      }
      return { status: "completed", model: "mock-source-recovery-vision", output_text: JSON.stringify(payload) };
    });
    const processing = () => processRoute.POST(jsonRequest(`/api/lessons/${id}/process`, { provider: "openai", orderMode: "AUTO" }), context);
    expect((await processing()).status).toBe(202);
    expect(sdk.callbacks).toHaveLength(1);
    await sdk.callbacks[0]();
    const saved = await getLesson(id);
    expect(saved.error).toBeNull();
    expect(saved.status).toBe("COMPLETED");
    expect(saved.images).toHaveLength(9);
    expect(saved.document?.photos).toHaveLength(9);
    expect(sawPersistedExtractions).toBe(true);
    expect(sdk.create).toHaveBeenCalledTimes(19); // 9 observations + organization + 9 states; no box retries.
    expect(preparedDimensions.size).toBe(9);
    expect([...preparedDimensions.values()].every((photo) => Math.max(photo.width, photo.height) <= 2200)).toBe(true);
    expect([...preparedDimensions.values()].some((photo) => photo.width > photo.height)).toBe(true);
    expect([...preparedDimensions.values()].some((photo) => photo.width < photo.height)).toBe(true);
    const recovered = await db.extractionResult.findMany({ where: { run: { lessonId: id } } });
    expect(JSON.stringify(recovered.map((row) => row.content))).toContain("Source recovery");
    for (const [index, photo] of saved.document!.photos.entries()) {
      expect(photo.bodyMarkdown).toBe(visibleText(index));
      expect(photo.imageId).toBe(ids[index]);
      expect(photo.sourceImageIds).toEqual([ids[index]]);
      expect(photo.rotation).toBe(sources[index].rotation);
      const size = preparedDimensions.get(ids[index])!;
      expect(photo.imageAspectRatio).toBe(size.width / size.height);
    }

    // Identical reruns use recovered checkpoints, not another paid attempt at boxes.
    expect((await processing()).status).toBe(202);
    await sdk.callbacks[1]();
    expect((await getLesson(id)).status).toBe("COMPLETED");
    expect(sdk.create).toHaveBeenCalledTimes(19);
    expect(await db.extractionResult.count({ where: { run: { lessonId: id } } })).toBe(18);

    // Later photo-manager rotations cannot silently rotate an earlier saved crop.
    await imageRoute.PATCH(jsonRequest(`/api/images/${ids[4]}`, { rotation: 90 }, "PATCH"), { params: Promise.resolve({ id: ids[4] }) });
    const afterRotation = await getLesson(id);
    expect(afterRotation.images.find((photo) => photo.id === ids[4])?.rotation).toBe(90);
    expect(afterRotation.document!.photos[4].rotation).toBe(sources[4].rotation);
  }, 60000);
});
