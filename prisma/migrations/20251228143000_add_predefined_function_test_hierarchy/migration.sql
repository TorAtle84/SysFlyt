ALTER TABLE "PredefinedFunctionTest"
  ADD COLUMN "systemGroup" TEXT,
  ADD COLUMN "systemType" TEXT;

UPDATE "PredefinedFunctionTest"
SET "systemType" = "systemPart"
WHERE "systemType" IS NULL;
