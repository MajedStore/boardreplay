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
vi.mock("../lib/ai", () => ({
  reconstructLesson: mocks.reconstruct,
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

beforeAll(() => {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const sqlite = new DatabaseSync(filename);
  sqlite.exec(
    fs.readFileSync(
      "prisma/migrations/20261024000000_init/migration.sql",
      "utf8",
    ),
  );
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
    data: { reconstruction: JSON.parse(JSON.stringify(prior)) },
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
          reconstruction: reconstruction(state.image.id, "New observed result"),
          extractions: [
            {
              imageId: state.image.id,
              sequence: 0,
              language: "English",
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
    expect((await getLesson(state.lesson.id)).status).toBe("EXTRACTING");
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
    expect(result.reconstruction?.steps[0].text).toBe("New observed result");
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
    expect(revision.content).toEqual(state.prior);
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
