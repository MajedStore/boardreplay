-- Historical benchmarks retain their responses. New benchmarks freeze all supplied instructions.
ALTER TABLE "ComparisonRun" ADD COLUMN "systemInstructions" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ComparisonRun" ADD COLUMN "wrapperVersion" TEXT NOT NULL DEFAULT 'boardreplay-benchmark-v1';
