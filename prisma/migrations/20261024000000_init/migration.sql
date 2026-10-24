-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "course" TEXT NOT NULL DEFAULT '',
    "topic" TEXT NOT NULL DEFAULT '',
    "date" TEXT NOT NULL DEFAULT '',
    "language" TEXT NOT NULL DEFAULT 'Original language',
    "instructions" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "needsReprocessing" BOOLEAN NOT NULL DEFAULT false,
    "reconstruction" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LectureImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lessonId" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "storagePath" TEXT NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LectureImage_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProcessingRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lessonId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "imageSnapshot" JSONB NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "error" TEXT,
    CONSTRAINT "ProcessingRun_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExtractionResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    CONSTRAINT "ExtractionResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProcessingRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReconstructionRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lessonId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReconstructionRevision_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ComparisonRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lessonId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "imageSnapshot" JSONB NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ComparisonRun_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProviderResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comparisonId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "rawOutput" TEXT NOT NULL,
    "structuredOutput" JSONB,
    "durationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT NOT NULL DEFAULT '',
    "scores" JSONB NOT NULL,
    CONSTRAINT "ProviderResult_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "ComparisonRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReportDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lessonId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReportDraft_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LectureImage_lessonId_sequence_idx" ON "LectureImage"("lessonId", "sequence");

-- CreateIndex
CREATE INDEX "ProcessingRun_lessonId_idx" ON "ProcessingRun"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportDraft_lessonId_key" ON "ReportDraft"("lessonId");
