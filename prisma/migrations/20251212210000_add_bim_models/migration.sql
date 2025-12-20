-- CreateEnum
CREATE TYPE "ModelFormat" AS ENUM ('IFC', 'RVT', 'BIM');

-- CreateEnum
CREATE TYPE "ModelStatus" AS ENUM ('UPLOADING', 'CONVERTING', 'READY', 'ERROR');

-- CreateTable
CREATE TABLE "BimModel" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "format" "ModelFormat" NOT NULL,
    "originalPath" TEXT NOT NULL,
    "storagePath" TEXT,
    "status" "ModelStatus" NOT NULL DEFAULT 'UPLOADING',
    "errorMessage" TEXT,
    "uploadedById" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BimModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BimModelComponent" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "systemCode" TEXT,
    "componentTag" TEXT,
    "fullTag" TEXT,
    "ifcGuid" TEXT,
    "ifcType" TEXT,
    "name" TEXT,
    "floor" TEXT,
    "position" JSONB,
    "boundingBox" JSONB,
    "properties" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BimModelComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BimModelSession" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "hostUserId" TEXT NOT NULL,
    "cameraPosition" JSONB,
    "selectedComponentId" TEXT,
    "participants" JSONB,
    "state" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BimModelSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BimModel_projectId_idx" ON "BimModel"("projectId");

-- CreateIndex
CREATE INDEX "BimModelComponent_modelId_idx" ON "BimModelComponent"("modelId");

-- CreateIndex
CREATE INDEX "BimModelComponent_fullTag_idx" ON "BimModelComponent"("fullTag");

-- CreateIndex
CREATE INDEX "BimModelComponent_systemCode_componentTag_idx" ON "BimModelComponent"("systemCode", "componentTag");

-- CreateIndex
CREATE INDEX "BimModelSession_modelId_idx" ON "BimModelSession"("modelId");

-- CreateIndex
CREATE INDEX "BimModelSession_hostUserId_idx" ON "BimModelSession"("hostUserId");

-- CreateIndex
CREATE UNIQUE INDEX "BimModelComponent_modelId_fullTag_key" ON "BimModelComponent"("modelId", "fullTag");

-- AddForeignKey
ALTER TABLE "BimModel" ADD CONSTRAINT "BimModel_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BimModel" ADD CONSTRAINT "BimModel_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BimModelComponent" ADD CONSTRAINT "BimModelComponent_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "BimModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BimModelSession" ADD CONSTRAINT "BimModelSession_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "BimModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BimModelSession" ADD CONSTRAINT "BimModelSession_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

