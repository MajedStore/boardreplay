ALTER TABLE "Lesson" ADD COLUMN "document" JSONB;
ALTER TABLE "Lesson" ADD COLUMN "explanationsNeedRefresh" BOOLEAN NOT NULL DEFAULT false;
