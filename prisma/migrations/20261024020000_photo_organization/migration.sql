ALTER TABLE "Lesson" ADD COLUMN "organizationMode" TEXT NOT NULL DEFAULT 'AUTOMATIC';
ALTER TABLE "Lesson" ADD COLUMN "photoOrganization" JSONB;
ALTER TABLE "ProcessingRun" ADD COLUMN "organization" JSONB;
CREATE TABLE "PhotoAnalysisCache" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "lessonId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PhotoAnalysisCache_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PhotoAnalysisCache_lessonId_key_key" ON "PhotoAnalysisCache"("lessonId", "key");
