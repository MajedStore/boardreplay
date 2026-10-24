import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
const token = randomUUID();
const filename = path.resolve(`data/test-${token}.db`);
const uploadDirectory = path.resolve(`data/test-uploads-${token}`);
vi.stubEnv("DATABASE_URL", `file:${filename}`);
vi.stubEnv("UPLOAD_DIR", uploadDirectory);
const storage = await import("../lib/storage/images");
const { db } = await import("../lib/db");
const lessonRoutes = await import("../app/api/lessons/route");
const detailRoutes = await import("../app/api/lessons/[id]/route");
const imageRoutes = await import("../app/api/lessons/[id]/images/route");
const oneImageRoutes = await import("../app/api/images/[id]/route");
const restoreRoutes = await import("../app/api/lessons/[id]/restore/route");
const { sampleReconstruction } = await import("../lib/demo");
const { validateOrder } = await import("../lib/lessons");
const { getLesson, ensureEditable } = await import("../lib/lessons");
const { beginLessonOperation, endLessonOperation } =
  await import("../lib/operations");
const comparisonRoutes = await import("../app/api/comparisons/route");
const comparisonDetailRoutes =
  await import("../app/api/comparisons/[id]/route");
const comparisonResultRoutes =
  await import("../app/api/comparisons/[id]/results/route");
const comparisonRunRoutes =
  await import("../app/api/comparisons/[id]/run/route");
const resultRoutes = await import("../app/api/results/[id]/route");
const reportRoutes = await import("../app/api/report/route");
const preparedComparisonImageRoutes = await import("../app/api/comparisons/[id]/images/[imageId]/route");
const { EVALUATION_CATEGORIES } = await import("../lib/types");
const makeRequest = (url: string, body: unknown, method = "POST") =>
  new Request(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
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
afterAll(async () => {
  await db.$disconnect();
  for (const suffix of ["", "-wal", "-shm", "-journal"])
    fs.rmSync(filename + suffix, { force: true });
  if (uploadDirectory.startsWith(path.resolve("data") + path.sep))
    fs.rmSync(uploadDirectory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
describe("upload validation and ordering", () => {
  it.each([
    { type: "image/svg+xml", size: 100 },
    { type: "image/jpeg", size: 0 },
    { type: "image/png", size: 11 * 1024 * 1024 },
  ])("rejects invalid metadata %j", (file) =>
    expect(() => storage.validateUploadInfo(file)).toThrow(),
  );
  it("decodes bytes, detects spoofed MIME and corrupt files", async () => {
    const png = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    await expect(storage.inspectImage(png, "image/png")).resolves.toEqual({
      width: 100,
      height: 100,
    });
    await expect(storage.inspectImage(png, "image/jpeg")).rejects.toThrow(
      /MIME/,
    );
    await expect(
      storage.inspectImage(Buffer.from("not an image"), "image/png"),
    ).rejects.toThrow(/corrupt/);
  });
  it("rejects path traversal and invalid image orders", () => {
    expect(() => storage.safeStoragePath("../secret")).toThrow();
    expect(() =>
      storage.safeStoragePath(path.resolve("package.json")),
    ).toThrow();
    expect(validateOrder(["b", "a"], ["a", "b"])).toBe(true);
    expect(validateOrder(["a", "a"], ["a", "b"])).toBe(false);
    expect(validateOrder(["a"], ["a", "b"])).toBe(false);
  });
});
describe("real SQLite and filesystem workflow", () => {
  it("persists lessons, uploaded order, user corrections, revisions and cascading deletion", async () => {
    const create = await lessonRoutes.POST(
      makeRequest("/api/lessons", {
        title: "Persistence test",
        course: "Algebra",
      }),
    );
    expect(create.status).toBe(200);
    const lesson = await create.json();
    const context = { params: Promise.resolve({ id: lesson.id }) };
    const png = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    const form = new FormData();
    for (let index = 0; index < 4; index++)
      form.append(
        "files",
        new File([new Uint8Array(png)], `frame-${index}.png`, {
          type: "image/png",
        }),
      );
    const uploaded = await imageRoutes.POST(
      new Request(`http://localhost/api/lessons/${lesson.id}/images`, {
        method: "POST",
        body: form,
      }),
      context,
    );
    expect(uploaded.status).toBe(200);
    const state = await uploaded.json();
    expect(state.images.map((i: { sequence: number }) => i.sequence)).toEqual([
      0, 1, 2, 3,
    ]);
    const ids = state.images.map((i: { id: string }) => i.id) as string[];
    const reordered = await imageRoutes.PATCH(
      makeRequest("/images", { imageIds: [...ids].reverse() }, "PATCH"),
      context,
    );
    expect(
      (await reordered.json()).images.map((i: { id: string }) => i.id),
    ).toEqual([...ids].reverse());
    const invalid = await imageRoutes.PATCH(
      makeRequest("/images", { imageIds: [ids[0], ids[0]] }, "PATCH"),
      context,
    );
    expect(invalid.status).toBe(400);
    const reconstruction = sampleReconstruction(ids);
    let saved = await detailRoutes.PATCH(
      makeRequest("/lesson", { reconstruction }, "PATCH"),
      context,
    );
    expect(saved.status).toBe(200);
    const current = await saved.json();
    current.reconstruction.steps[0].text = "Corrected transcription";
    saved = await detailRoutes.PATCH(
      makeRequest(
        "/lesson",
        { reconstruction: current.reconstruction },
        "PATCH",
      ),
      context,
    );
    const edited = await saved.json();
    expect(edited.reconstruction.steps[0].evidenceStatus).toBe("USER_EDITED");
    expect(edited.reconstruction.steps[0].text).toBe("Corrected transcription");
    expect(edited.revisions).toHaveLength(1);
    const persisted = await db.lesson.findUniqueOrThrow({
      where: { id: lesson.id },
    });
    expect(JSON.stringify(persisted.reconstruction)).toContain(
      "Corrected transcription",
    );
    const restored = await restoreRoutes.POST(
      makeRequest("/restore", { revisionId: edited.revisions[0].id }),
      context,
    );
    expect((await restored.json()).reconstruction.steps[0].text).not.toBe(
      "Corrected transcription",
    );
    const imageId = ids[0];
    const rotated = await oneImageRoutes.PATCH(
      makeRequest("/image", { rotation: 90 }, "PATCH"),
      { params: Promise.resolve({ id: imageId }) },
    );
    expect(
      (await rotated.json()).images.find(
        (i: { id: string }) => i.id === imageId,
      ).rotation,
    ).toBe(90);
    const imageRows = await db.lectureImage.findMany({
      where: { lessonId: lesson.id },
    });
    expect(
      imageRows.every((image) =>
        fs.existsSync(storage.safeStoragePath(image.storagePath)),
      ),
    ).toBe(true);
    expect(
      (
        await detailRoutes.DELETE(
          new Request("http://localhost/lesson", { method: "DELETE" }),
          context,
        )
      ).status,
    ).toBe(200);
    expect(await db.lesson.findUnique({ where: { id: lesson.id } })).toBeNull();
    expect(
      await db.lectureImage.count({ where: { lessonId: lesson.id } }),
    ).toBe(0);
    expect(
      await db.reconstructionRevision.count({ where: { lessonId: lesson.id } }),
    ).toBe(0);
    expect(
      imageRows.every(
        (image) => !fs.existsSync(storage.safeStoragePath(image.storagePath)),
      ),
    ).toBe(true);
  });
  it("blocks cross-origin mutations", async () => {
    const response = await lessonRoutes.POST(
      new Request("http://localhost/api/lessons", {
        method: "POST",
        headers: {
          origin: "https://untrusted.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ title: "bad" }),
      }),
    );
    expect(response.status).toBe(403);
  });
  it("accepts matching browser Origin and Host when Next uses localhost internally", async () => {
    const response = await lessonRoutes.POST(
      new Request("http://localhost:3000/api/lessons", {
        method: "POST",
        headers: {
          host: "127.0.0.1:3000",
          origin: "http://127.0.0.1:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ title: "Loopback origin test" }),
      }),
    );
    expect(response.status).toBe(200);
    const lesson = await response.json();
    const rejected = await lessonRoutes.POST(
      new Request("http://localhost:3000/api/lessons", {
        method: "POST",
        headers: {
          host: "127.0.0.1:3000",
          origin: "https://untrusted.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ title: "Rejected origin" }),
      }),
    );
    expect(rejected.status).toBe(403);
    await db.lesson.delete({ where: { id: lesson.id } });
  });
  it("recovers interrupted persisted work while preserving live operation locks", async () => {
    const lesson = await db.lesson.create({
      data: { title: "Interrupted job", status: "EXTRACTING" },
    });
    const run = await db.processingRun.create({
      data: {
        lessonId: lesson.id,
        status: "EXTRACTING",
        provider: "openai",
        model: "mock",
        imageSnapshot: [],
      },
    });
    const token = beginLessonOperation(lesson.id, "processing");
    try {
      expect((await getLesson(lesson.id)).status).toBe("EXTRACTING");
      await expect(ensureEditable(lesson.id)).rejects.toMatchObject({
        status: 409,
      });
    } finally {
      endLessonOperation(lesson.id, token);
    }
    const recovered = await getLesson(lesson.id);
    expect(recovered.status).toBe("FAILED");
    expect(recovered.error).toContain("local server stopped");
    const savedRun = await db.processingRun.findUniqueOrThrow({
      where: { id: run.id },
    });
    expect(savedRun.status).toBe("FAILED");
    expect(savedRun.completedAt).not.toBeNull();
    await expect(ensureEditable(lesson.id)).resolves.toMatchObject({
      status: "FAILED",
    });
    await db.lesson.delete({ where: { id: lesson.id } });
  });
  it("preserves the original revision when deleting an image and repairs missing references on restore", async () => {
    const lesson = await db.lesson.create({
      data: { title: "Deleted source revision", status: "COMPLETED" },
    });
    const rows = [];
    for (let index = 0; index < 4; index++)
      rows.push(
        await db.lectureImage.create({
          data: {
            lessonId: lesson.id,
            originalFilename: `frame-${index}.png`,
            sequence: index,
            mimeType: "image/png",
            width: 100,
            height: 100,
            storagePath: `${randomUUID()}.png`,
          },
        }),
      );
    const ids = rows.map((image) => image.id);
    const content = sampleReconstruction(ids);
    await db.lesson.update({
      where: { id: lesson.id },
      data: { reconstruction: JSON.parse(JSON.stringify(content)) },
    });
    const deleted = await oneImageRoutes.DELETE(
      new Request("http://localhost/image", { method: "DELETE" }),
      { params: Promise.resolve({ id: ids[0] }) },
    );
    expect(deleted.status).toBe(200);
    const afterDelete = await deleted.json();
    const revision = await db.reconstructionRevision.findFirstOrThrow({
      where: { lessonId: lesson.id },
      orderBy: { createdAt: "desc" },
    });
    expect(JSON.stringify(revision.content)).toContain(ids[0]);
    expect(
      afterDelete.reconstruction.steps.every(
        (step: { sourceImageIds: string[] }) =>
          !step.sourceImageIds.includes(ids[0]),
      ),
    ).toBe(true);
    const restored = await restoreRoutes.POST(
      makeRequest("/restore", { revisionId: revision.id }),
      { params: Promise.resolve({ id: lesson.id }) },
    );
    expect(restored.status).toBe(200);
    const result = await restored.json();
    const affectedOriginalIds = new Set(
      content.steps
        .filter((step) => step.sourceImageIds.includes(ids[0]))
        .map((step) => step.id),
    );
    expect(affectedOriginalIds.size).toBeGreaterThan(0);
    for (const step of result.reconstruction.steps) {
      expect(step.sourceImageIds).not.toContain(ids[0]);
      if (affectedOriginalIds.has(step.id)) {
        expect(step.evidenceStatus).toBe("UNCERTAIN");
        expect(step.uncertainty).toContain("no longer available");
      }
    }
    expect(result.needsReprocessing).toBe(true);
    await db.lesson.delete({ where: { id: lesson.id } });
  });
});

describe("persisted comparison and academic report API", () => {
  it("downloads exactly the prepared API image from the saved rotation and rejects nonmembers", async () => {
    const lesson = await db.lesson.create({ data: { title: "Prepared image parity", status: "READY" } });
    const pixels = Buffer.alloc(120 * 80 * 3, 255);
    for (let y = 0; y < 80; y++) for (let x = 0; x < 40; x++) {
      const offset = (y * 120 + x) * 3;
      pixels[offset] = 20; pixels[offset + 1] = 80; pixels[offset + 2] = 120;
    }
    const png = await sharp(pixels, { raw: { width: 120, height: 80, channels: 3 } }).png().toBuffer();
    const firstStored = await storage.storeImage(png, "image/png");
    const image = await db.lectureImage.create({ data: { lessonId: lesson.id, originalFilename: "asymmetric.png", sequence: 0, rotation: 90, mimeType: "image/png", ...firstStored } });
    try {
      const created = await comparisonRoutes.POST(makeRequest("/api/comparisons", { lessonId: lesson.id, prompt: "Transcribe exactly the supplied photographed board." }));
      expect(created.status).toBe(200);
      const comparison = await created.json();
      await db.lectureImage.update({ where: { id: image.id }, data: { rotation: 180 } });
      const prepared = await preparedComparisonImageRoutes.GET(new Request("http://localhost/prepared-image"), { params: Promise.resolve({ id: comparison.id, imageId: image.id }) });
      expect(prepared.status).toBe(200);
      expect(prepared.headers.get("Content-Type")).toBe("image/jpeg");
      expect(prepared.headers.get("Cache-Control")).toBe("private, no-store");
      expect(prepared.headers.get("Content-Disposition")).toContain('filename="boardreplay-photo-01.jpg"');
      const expected = await storage.imageForAI({ ...image, rotation: 90, sequence: 0 });
      const actual = Buffer.from(await prepared.arrayBuffer());
      expect(actual.equals(Buffer.from(expected.base64, "base64"))).toBe(true);
      const currentRotation = await storage.imageForAI({ ...image, rotation: 180, sequence: 0 });
      expect(actual.equals(Buffer.from(currentRotation.base64, "base64"))).toBe(false);
      expect(await sharp(actual).metadata()).toMatchObject({ format: "jpeg", width: 80, height: 120 });

      const otherStored = await storage.storeImage(png, "image/png");
      const nonmember = await db.lectureImage.create({ data: { lessonId: lesson.id, originalFilename: "not-in-benchmark.png", sequence: 1, mimeType: "image/png", ...otherStored } });
      const rejected = await preparedComparisonImageRoutes.GET(new Request("http://localhost/nonmember"), { params: Promise.resolve({ id: comparison.id, imageId: nonmember.id }) });
      expect(rejected.status).toBe(404);
      const missing = await preparedComparisonImageRoutes.GET(new Request("http://localhost/missing-benchmark"), { params: Promise.resolve({ id: "not-a-comparison", imageId: image.id }) });
      expect(missing.status).toBe(404);
    } finally {
      await detailRoutes.DELETE(new Request("http://localhost/lesson", { method: "DELETE" }), { params: Promise.resolve({ id: lesson.id }) });
    }
  });
  it("preserves benchmark inputs, actual manual output, validated scores, reference and report; cleans up results", async () => {
    const create = await lessonRoutes.POST(
      makeRequest("/api/lessons", {
        title: "Comparison API test",
        course: "AI systems",
      }),
    );
    const lesson = await create.json();
    const lessonContext = { params: Promise.resolve({ id: lesson.id }) };
    const png = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    const form = new FormData();
    form.append(
      "files",
      new File([new Uint8Array(png)], "board-first.png", { type: "image/png" }),
    );
    form.append(
      "files",
      new File([new Uint8Array(png)], "board-second.png", {
        type: "image/png",
      }),
    );
    const uploaded = await imageRoutes.POST(
      new Request(`http://localhost/api/lessons/${lesson.id}/images`, {
        method: "POST",
        body: form,
      }),
      lessonContext,
    );
    const uploadedLesson = await uploaded.json();
    const ids = uploadedLesson.images.map(
      (image: { id: string }) => image.id,
    ) as string[];
    const prompt =
      "Transcribe these two whiteboards in their supplied chronological order.";
    const created = await comparisonRoutes.POST(
      makeRequest("/api/comparisons", { lessonId: lesson.id, prompt }),
    );
    expect(created.status).toBe(200);
    const comparison = await created.json();
    const comparisonContext = {
      params: Promise.resolve({ id: comparison.id }),
    };
    expect(comparison.imageIds).toEqual(ids);
    expect(comparison.imageSnapshot).toEqual(
      ids.map((id, sequence) => ({ id, sequence, rotation: 0 })),
    );
    expect(comparison.results).toEqual([]);

    // Subsequent edits to the source lesson must not rewrite the benchmark snapshot.
    await imageRoutes.PATCH(
      makeRequest("/images", { imageIds: [...ids].reverse() }, "PATCH"),
      lessonContext,
    );
    await oneImageRoutes.PATCH(
      makeRequest("/image", { rotation: 90 }, "PATCH"),
      { params: Promise.resolve({ id: ids[0] }) },
    );
    const listed = await comparisonRoutes.GET(
      new Request(`http://localhost/api/comparisons?lessonId=${lesson.id}`),
    );
    const savedRuns = await listed.json();
    expect(savedRuns[0].prompt).toBe(prompt);
    expect(savedRuns[0].imageIds).toEqual(ids);
    expect(savedRuns[0].imageSnapshot[0].rotation).toBe(0);

    const rawOutput =
      "Visible board: x + 2 = 5. Therefore x = 3. The second image repeats the result.";
    const manual = await comparisonResultRoutes.POST(
      makeRequest("/results", {
        provider: "gemini",
        model: "User-recorded official model",
        rawOutput,
        notes: "Official interface; same prompt and ordered images.",
      }),
      comparisonContext,
    );
    expect(manual.status).toBe(200);
    const withManual = await manual.json();
    expect(withManual.results).toHaveLength(1);
    const result = withManual.results[0];
    expect(result.mode).toBe("MANUAL");
    expect(result.rawOutput).toBe(rawOutput);
    expect(result.durationMs).toBeNull();
    expect(result.scores).toEqual({});
    const resultContext = { params: Promise.resolve({ id: result.id }) };
    for (const invalid of [-1, 6, 2.5, null]) {
      const response = await resultRoutes.PATCH(
        makeRequest("/result", { scores: { textAccuracy: invalid } }, "PATCH"),
        resultContext,
      );
      expect(response.status).toBe(400);
    }
    const unexpected = await resultRoutes.PATCH(
      makeRequest("/result", { scores: { inventedCategory: 5 } }, "PATCH"),
      resultContext,
    );
    expect(unexpected.status).toBe(400);
    const scores = Object.fromEntries(
      EVALUATION_CATEGORIES.map((key, index) => [key, index === 0 ? 0 : 4]),
    );
    const assessed = await resultRoutes.PATCH(
      makeRequest(
        "/result",
        { scores, notes: "Text was checked against both photographs." },
        "PATCH",
      ),
      resultContext,
    );
    expect(assessed.status).toBe(200);
    expect((await assessed.json()).scores).toEqual(scores);

    const reference = "Verified reference: x + 2 = 5; x = 3.";
    const editedReference = await comparisonDetailRoutes.PATCH(
      makeRequest("/comparison", { reference }, "PATCH"),
      comparisonContext,
    );
    expect((await editedReference.json()).reference).toBe(reference);
    const referenceRow = await db.comparisonRun.findUniqueOrThrow({
      where: { id: comparison.id },
    });
    expect(referenceRow.reference).toBe(reference);

    const draft = {
      problem: "Disconnected photographs",
      objective: "Traceable reconstruction",
      methodology: "Same inputs; human scores",
      implementation: "Ordered replay with evidence",
      limitations: "Uncaptured writing is unavailable",
      conclusion: "Conclusions recorded by the student.",
    };
    const savedReport = await reportRoutes.PUT(
      makeRequest(`/api/report?lessonId=${lesson.id}`, draft, "PUT"),
    );
    expect(savedReport.status).toBe(200);
    const loadedReport = await reportRoutes.GET(
      new Request(`http://localhost/api/report?lessonId=${lesson.id}`),
    );
    expect(await loadedReport.json()).toEqual(draft);

    // An unavailable provider must not create an invented automatic response.
    vi.stubEnv("OPENAI_API_KEY", "");
    const unavailable = await comparisonRunRoutes.POST(
      makeRequest("/run", { provider: "openai" }),
      comparisonContext,
    );
    expect(unavailable.status).toBe(400);
    expect(
      await db.providerResult.count({ where: { comparisonId: comparison.id } }),
    ).toBe(1);
    const protectedImage = await oneImageRoutes.DELETE(
      new Request("http://localhost/image", { method: "DELETE" }),
      { params: Promise.resolve({ id: ids[0] }) },
    );
    expect(protectedImage.status).toBe(409);
    const deleted = await comparisonDetailRoutes.DELETE(
      new Request("http://localhost/comparison", { method: "DELETE" }),
      comparisonContext,
    );
    expect(deleted.status).toBe(200);
    expect(
      await db.providerResult.count({ where: { comparisonId: comparison.id } }),
    ).toBe(0);
    expect(
      await db.comparisonRun.findUnique({ where: { id: comparison.id } }),
    ).toBeNull();
    expect(
      (
        await oneImageRoutes.DELETE(
          new Request("http://localhost/image", { method: "DELETE" }),
          { params: Promise.resolve({ id: ids[0] }) },
        )
      ).status,
    ).toBe(200);
    await detailRoutes.DELETE(
      new Request("http://localhost/lesson", { method: "DELETE" }),
      lessonContext,
    );
    expect(await db.reportDraft.count({ where: { lessonId: lesson.id } })).toBe(
      0,
    );
  });
});
