-- CreateEnum
CREATE TYPE "NCRCategory" AS ENUM ('INSTALLATION', 'DOCUMENTATION', 'EQUIPMENT', 'SAFETY', 'OTHER');

-- CreateEnum
CREATE TYPE "NCRSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NCRStatus" AS ENUM ('IN_PROGRESS', 'DEVIATION', 'CANCELED', 'REMEDIATED', 'COMPLETED');

-- CreateTable
CREATE TABLE "NCR" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "NCRCategory" NOT NULL,
    "severity" "NCRSeverity" NOT NULL,
    "status" "NCRStatus" NOT NULL DEFAULT 'DEVIATION',
    "reportedBy" TEXT NOT NULL,
    "assignedTo" TEXT,
    "linkedItemId" TEXT,
    "rootCause" TEXT,
    "corrective" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NCR_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NCRPhoto" (
    "id" TEXT NOT NULL,
    "ncrId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NCRPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NCRComment" (
    "id" TEXT NOT NULL,
    "ncrId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NCRComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NCR_projectId_idx" ON "NCR"("projectId");

-- CreateIndex
CREATE INDEX "NCR_status_idx" ON "NCR"("status");

-- CreateIndex
CREATE INDEX "NCR_category_idx" ON "NCR"("category");

-- CreateIndex
CREATE INDEX "NCR_severity_idx" ON "NCR"("severity");

-- CreateIndex
CREATE INDEX "NCRPhoto_ncrId_idx" ON "NCRPhoto"("ncrId");

-- CreateIndex
CREATE INDEX "NCRComment_ncrId_idx" ON "NCRComment"("ncrId");

-- CreateIndex
CREATE INDEX "NCRComment_userId_idx" ON "NCRComment"("userId");

-- AddForeignKey
ALTER TABLE "NCR" ADD CONSTRAINT "NCR_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NCR" ADD CONSTRAINT "NCR_reportedBy_fkey" FOREIGN KEY ("reportedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NCR" ADD CONSTRAINT "NCR_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NCR" ADD CONSTRAINT "NCR_linkedItemId_fkey" FOREIGN KEY ("linkedItemId") REFERENCES "MCProtocolItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NCRPhoto" ADD CONSTRAINT "NCRPhoto_ncrId_fkey" FOREIGN KEY ("ncrId") REFERENCES "NCR"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NCRComment" ADD CONSTRAINT "NCRComment_ncrId_fkey" FOREIGN KEY ("ncrId") REFERENCES "NCR"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NCRComment" ADD CONSTRAINT "NCRComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
