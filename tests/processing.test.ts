import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import type { ReconstructionRequest, ReconstructionResult } from "../lib/ai";
import type { PhotoOrganization } from "../lib/types";
import { sampleLectureDocument } from "../lib/demo-document";

const mocks = vi.hoisted(() => ({
  callbacks: [] as Array<() => void | Promise<void>>,
  reconstruct: vi.fn(),
  providers: vi.fn(),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (callback: () => void | Promise<void>) => {
    mocks.callbacks.push(callback);
  },
}));
vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  limit: vi.fn(), // Each isolated scenario exercises processing, not the shared per-minute quota.
}));
vi.mock("../lib/ai", () => ({
  reconstructLesson: mocks.reconstruct,
  explainLesson: async (input: ReconstructionRequest) => {
    const result = await mocks.reconstruct(input);
    return { ...result, document: result.document || sampleLectureDocument(result.reconstruction, input.images.map((image) => ({ ...image, width: 100, height: 100, rotation: 0 }))) };
  },
  getProviders: mocks.providers,
}));

const token = randomUUID();
const filename = path.resolve(`data/test-processing-${token}.db`);
const uploadDirectory = path.resolve(`data/test-processing-uploads-${token}`);
vi.stubEnv("DATABASE_URL", `file:${filename}`);
vi.stubEnv("UPLOAD_DIR", uploadDirectory);
const { db } = await import("../lib/db");
const { storeImage } = await import("../lib/storage/images");
const { getLesson, ensureEditable } = await import("../lib/lessons");
const processingRoute = await import("../app/api/lessons/[id]/process/route");
const lessonRoute = await import("../app/api/lessons/[id]/route");
const restoreRoute = await import("../app/api/lessons/[id]/restore/route");

beforeAll(() => {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const sqlite = new DatabaseSync(filename);
  sqlite.exec(
    fs.readFileSync(
      "prisma/migrations/20261024000000_init/migration.sql",
      "utf8",
    ),
  );
  sqlite.exec(
    fs.readFileSync(
      "prisma/migrations/20261024010000_universal_benchmark_snapshot/migration.sql",
      "utf8",
    ),
  );
  sqlite.exec(fs.readFileSync("prisma/migrations/20261024020000_photo_organization/migration.sql", "utf8"));
  sqlite.exec(fs.readFileSync("prisma/migrations/20261025010000_photo_lecture_document/migration.sql", "utf8"));
  sqlite.close();
});
beforeEach(() => {
  mocks.callbacks.length = 0;
  mocks.reconstruct.mockReset();
  mocks.providers.mockReturnValue([
    {
      id: "openai",
      name: "OpenAI",
      model: "configured-mock-model",
      configured: true,
    },
  ]);
});
afterAll(async () => {
  await db.$disconnect();
  for (const suffix of ["", "-wal", "-shm", "-journal"])
    fs.rmSync(filename + suffix, { force: true });
  if (uploadDirectory.startsWith(path.resolve("data") + path.sep))
    fs.rmSync(uploadDirectory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

function reconstruction(
  imageId: string,
  text: string,
  evidenceStatus: "OBSERVED" | "USER_EDITED" = "OBSERVED",
) {
  return {
    title: "Pipeline route fixture",
    overview: "A visible equality.",
    concepts: ["Arithmetic"],
    sections: [{ id: "section", title: "Captured board" }],
    unresolved: [],
    steps: [
      {
        id: "step",
        type: "equation" as const,
        sectionId: "section",
        text,
        latex: "2+2=4",
        stepIndex: 0,
        sourceImageIds: [imageId],
        evidenceStatus,
        originalText: "2+2=4",
      },
    ],
  };
}
function organization(imageIds: string[]): PhotoOrganization {
  return { version: 1, mode: "AUTOMATIC", sequences: [{ id: "fixture-sequence", title: "Mocked visible progression", orderingConfidence: "HIGH", uncertainty: null, states: imageIds.map((id, index) => ({ id: `state-${index}`, imageIds: [id], primaryImageId: id, reason: "Authored provider fixture, not a live vision result.", confidence: "HIGH" })) }], duplicateGroups: [], relationships: [], warnings: [] };
}
async function fixture() {
  const lesson = await db.lesson.create({
    data: { title: "Processing route", status: "READY" },
  });
  const png = await sharp({
    create: { width: 100, height: 100, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  const stored = await storeImage(png, "image/png");
  const image = await db.lectureImage.create({
    data: {
      lessonId: lesson.id,
      originalFilename: "board.png",
      sequence: 0,
      mimeType: "image/png",
      ...stored,
    },
  });
  const prior = reconstruction(
    image.id,
    "Prior manual correction",
    "USER_EDITED",
  );
  await db.lesson.update({
    where: { id: lesson.id },
    data: { reconstruction: JSON.parse(JSON.stringify(prior)), document: JSON.parse(JSON.stringify(sampleLectureDocument(prior, [image]))) },
  });
  const context = { params: Promise.resolve({ id: lesson.id }) };
  const request = () =>
    new Request(`http://localhost/api/lessons/${lesson.id}/process`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "openai" }),
    });
  return { lesson, image, prior, context, request };
}

describe("processing route with real SQLite/files and mocked AI/background scheduling", () => {
  it("saves an explanation correction with source traceability and restores its document revision", async () => {
    const state = await fixture();
    const before = (await getLesson(state.lesson.id)).document!;
    const response = await lessonRoute.PATCH(new Request(`http://localhost/api/lessons/${state.lesson.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ explanation: { imageId: state.image.id, heading: "Corrected heading", bodyMarkdown: "Üniversite düzeyinde düzeltilmiş açıklama.\n\n$$A=Q\\Lambda Q^T$$" } }) }), state.context);
    expect(response.status).toBe(200);
    const edited = await getLesson(state.lesson.id);
    expect(edited.document!.photos[0]).toMatchObject({ evidenceStatus: "USER_EDITED", heading: "Corrected heading", imageId: state.image.id, sourceImageIds: [state.image.id] });
    const revision = await db.reconstructionRevision.findFirstOrThrow({ where: { lessonId: state.lesson.id } });
    expect((await restoreRoute.POST(new Request(`http://localhost/api/lessons/${state.lesson.id}/restore`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ revisionId: revision.id }) }), state.context)).status).toBe(200);
    expect((await getLesson(state.lesson.id)).document).toEqual(before);
  });
  it("persists a corrected document order and supplies it as manual context on regeneration", async () => {
    const state = await fixture();
    const stored = await storeImage(fs.readFileSync("public/demo/frame-2.png"), "image/png");
    const second = await db.lectureImage.create({ data: { lessonId: state.lesson.id, originalFilename: "second.png", sequence: 1, mimeType: "image/png", ...stored } });
    const document = sampleLectureDocument(state.prior, [state.image, second]);
    await db.lesson.update({ where: { id: state.lesson.id }, data: { document: JSON.parse(JSON.stringify(document)) } });
    const ordered = [second.id, state.image.id];
    const response = await lessonRoute.PATCH(new Request(`http://localhost/api/lessons/${state.lesson.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ documentOrder: ordered }) }), state.context);
    expect(response.status).toBe(200);
    const corrected = await getLesson(state.lesson.id);
    expect(corrected.document!.photos.map((photo) => photo.imageId)).toEqual(ordered);
    expect(corrected.explanationsNeedRefresh).toBe(true);
    mocks.reconstruct.mockImplementation(async (input: ReconstructionRequest) => {
      expect(input.images.map((image) => image.id)).toEqual(ordered);
      expect(input.organizationMode).toBe("MANUAL");
      return { provider: "openai", model: "manual-context-fixture", extractions: [], organization: organization(ordered), document: sampleLectureDocument(state.prior, [second, state.image]) };
    });
    const processing = await processingRoute.POST(new Request(`http://localhost/api/lessons/${state.lesson.id}/process`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "openai", orderMode: "MANUAL" }) }), state.context);
    expect(processing.status).toBe(202);
    await mocks.callbacks[0]();
    const result = await getLesson(state.lesson.id);
    expect(result.status).toBe("COMPLETED");
    expect(result.document!.photos.map((photo) => photo.imageId)).toEqual(ordered);
    expect(result.explanationsNeedRefresh).toBe(false);
  });
  it("starts automatic organization with nine valid photos and persists its proposed states without deleting originals", async () => {
    const state = await fixture();
    for (const [offset, frame] of [3, 1, 4, 2, 5, 3, 1, 4].entries()) {
      const stored = await storeImage(fs.readFileSync(`public/demo/frame-${frame}.png`), "image/png");
      await db.lectureImage.create({ data: { lessonId: state.lesson.id, originalFilename: `random-upload-${8 - offset}.png`, sequence: offset + 1, mimeType: "image/png", ...stored } });
    }
    let proposed: PhotoOrganization;
    mocks.reconstruct.mockImplementation(async (input: ReconstructionRequest): Promise<ReconstructionResult> => {
      expect(input.images).toHaveLength(9);
      expect(input.organizationMode).toBe("AUTOMATIC");
      expect(input.photoMetrics).toHaveLength(9);
      expect(input.photoMetrics?.every((photo) => photo.pixelSha256.length === 64 && photo.qualityScore >= 0 && photo.qualityScore <= 1)).toBe(true);
      for (const stage of ["FINDING_DUPLICATES", "ORGANIZING"] as const) {
        await input.onStage?.(stage);
        expect((await getLesson(state.lesson.id)).status).toBe(stage);
      }
      proposed = organization(input.images.map((image) => image.id).reverse());
      await input.onOrganization?.(proposed);
      expect((await getLesson(state.lesson.id)).photoOrganization).toEqual(proposed);
      await input.onStage?.("RECONSTRUCTING");
      return { provider: "openai", model: "mock-nine-photo-model", organization: proposed, reconstruction: { ...reconstruction(state.image.id, "Mocked organized lesson"), organization: proposed }, extractions: [] };
    });
    expect((await processingRoute.POST(state.request(), state.context)).status).toBe(202);
    await mocks.callbacks[0]();
    const saved = await getLesson(state.lesson.id);
    expect(saved.status).toBe("COMPLETED");
    expect(saved.images).toHaveLength(9);
    expect(saved.images[0].id).toBe(state.image.id);
    expect(saved.runs[0].organization).toEqual(proposed!);
    expect(await db.photoAnalysisCache.count({ where: { lessonId: state.lesson.id } })).toBeGreaterThan(0);
  });

  it("retains completed analysis after failure, reuses it on retry, and permits an explicit fresh analysis", async () => {
    const state = await fixture();
    const accepted = { value: "Validated mock observation" };
    mocks.reconstruct.mockImplementation(async (input: ReconstructionRequest) => {
      await input.cache!.set("observation-checkpoint", accepted);
      await input.onExtraction?.({ imageId: state.image.id, sequence: 0, language: "English", boardState: "UNREADABLE", disciplines: [], boardAspectRatio: null, items: [], unreadableRegions: ["Mock partial observation"], boardOverview: "Mocked partial analysis before a later failure" });
      throw new Error("A later provider request failed.");
    });
    await processingRoute.POST(state.request(), state.context);
    await mocks.callbacks[0]();
    expect((await getLesson(state.lesson.id)).status).toBe("FAILED");
    expect(await db.extractionResult.count({ where: { run: { lessonId: state.lesson.id } } })).toBe(1);
    mocks.reconstruct.mockImplementation(async (input: ReconstructionRequest): Promise<ReconstructionResult> => {
      expect(await input.cache!.get("observation-checkpoint")).toEqual(accepted);
      return { provider: "openai", model: "mock-retried-model", organization: organization([state.image.id]), reconstruction: reconstruction(state.image.id, "Retried result"), extractions: [] };
    });
    await processingRoute.POST(state.request(), state.context);
    await mocks.callbacks[1]();
    expect((await getLesson(state.lesson.id)).status).toBe("COMPLETED");
    mocks.reconstruct.mockImplementation(async (input: ReconstructionRequest): Promise<ReconstructionResult> => {
      expect(await input.cache!.get("observation-checkpoint")).toBeNull();
      return { provider: "openai", model: "mock-refreshed-model", organization: organization([state.image.id]), reconstruction: reconstruction(state.image.id, "Fresh result"), extractions: [] };
    });
    const fresh = new Request(`http://localhost/api/lessons/${state.lesson.id}/process`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "openai", forceRefresh: true }) });
    await processingRoute.POST(fresh, state.context);
    await mocks.callbacks[2]();
    expect((await getLesson(state.lesson.id)).document?.photos[0].imageId).toBe(state.image.id);
  });

  it("claims once, records actual stages and model, stores extractions, and preserves user notes as a revision", async () => {
    const state = await fixture();
    const observedStages: string[] = [];
    mocks.reconstruct.mockImplementation(
      async (input: ReconstructionRequest): Promise<ReconstructionResult> => {
        expect(input.images).toHaveLength(1);
        expect(input.images[0]).toMatchObject({
          id: state.image.id,
          sequence: 0,
          mimeType: "image/jpeg",
        });
        for (const stage of ["EXTRACTING", "RECONSTRUCTING"] as const) {
          await input.onStage?.(stage);
          observedStages.push(
            (
              await db.lesson.findUniqueOrThrow({
                where: { id: state.lesson.id },
              })
            ).status,
          );
        }
        return {
          provider: "openai",
          model: "actual-returned-model",
          organization: organization([state.image.id]),
          reconstruction: reconstruction(state.image.id, "New observed result"),
          extractions: [
            {
              imageId: state.image.id,
              sequence: 0,
              language: "English",
              boardState:"CONTENT",
              disciplines: [],
              boardAspectRatio: null,
              items: [],
              unreadableRegions: [],
              boardOverview: "Mocked visible equality",
            },
          ],
        };
      },
    );
    const response = await processingRoute.POST(state.request(), state.context);
    expect(response.status).toBe(202);
    expect((await getLesson(state.lesson.id)).status).toBe("ANALYZING");
    await expect(ensureEditable(state.lesson.id)).rejects.toMatchObject({
      status: 409,
    });
    const duplicate = await processingRoute.POST(
      state.request(),
      state.context,
    );
    expect(duplicate.status).toBe(409);
    expect(mocks.callbacks).toHaveLength(1);
    await mocks.callbacks[0]();
    expect(observedStages).toEqual(["EXTRACTING", "RECONSTRUCTING"]);
    const result = await getLesson(state.lesson.id);
    expect(result.status).toBe("COMPLETED");
    expect(result.document?.photos[0].imageId).toBe(state.image.id);
    expect(result.runs[0]).toMatchObject({
      status: "COMPLETED",
      provider: "openai",
      model: "actual-returned-model",
    });
    expect(result.runs[0].completedAt).not.toBeNull();
    expect(
      await db.extractionResult.count({ where: { runId: result.runs[0].id } }),
    ).toBe(1);
    const revision = await db.reconstructionRevision.findFirstOrThrow({
      where: { lessonId: state.lesson.id },
    });
    expect(revision.content).toMatchObject({ kind: "PHOTO_LECTURE" });
    await expect(ensureEditable(state.lesson.id)).resolves.toMatchObject({
      status: "COMPLETED",
    });
  });

  it("saves a safe failure, keeps prior edited notes, and releases the operation lock", async () => {
    const state = await fixture();
    mocks.reconstruct.mockRejectedValue(
      new Error("Secret API payload: never-expose-this-value"),
    );
    expect(
      (await processingRoute.POST(state.request(), state.context)).status,
    ).toBe(202);
    await mocks.callbacks[0]();
    const result = await getLesson(state.lesson.id);
    expect(result.status).toBe("FAILED");
    expect(result.error).not.toContain("never-expose-this-value");
    expect(result.reconstruction).toEqual(state.prior);
    expect(result.runs[0].status).toBe("FAILED");
    expect(result.runs[0].error).not.toContain("never-expose-this-value");
    expect(result.runs[0].completedAt).not.toBeNull();
    await expect(ensureEditable(state.lesson.id)).resolves.toMatchObject({
      status: "FAILED",
    });
  });

  it("rejects missing credentials before creating any processing run or background task", async () => {
    const state = await fixture();
    mocks.providers.mockReturnValue([
      { id: "openai", name: "OpenAI", model: "mock", configured: false },
    ]);
    expect(
      (await processingRoute.POST(state.request(), state.context)).status,
    ).toBe(400);
    expect(
      await db.processingRun.count({ where: { lessonId: state.lesson.id } }),
    ).toBe(0);
    expect(mocks.callbacks).toHaveLength(0);
    expect(mocks.reconstruct).not.toHaveBeenCalled();
    expect((await getLesson(state.lesson.id)).status).toBe("READY");
  });
});
