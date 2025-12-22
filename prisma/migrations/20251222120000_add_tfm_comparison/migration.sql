-- CreateTable
CREATE TABLE "TfmComparison" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "segmentConfig" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "TfmComparison_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TfmComparison_projectId_idx" ON "TfmComparison"("projectId");

-- AddForeignKey
ALTER TABLE "TfmComparison" ADD CONSTRAINT "TfmComparison_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TfmComparison" ADD CONSTRAINT "TfmComparison_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
