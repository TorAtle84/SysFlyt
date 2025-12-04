/*
  Warnings:

  - You are about to drop the column `code` on the `MassList` table. All the data in the column will be lost.
  - Made the column `projectId` on table `MassList` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "MassList" DROP CONSTRAINT "MassList_projectId_fkey";

-- AlterTable
ALTER TABLE "DocumentComponent" ADD COLUMN     "page" INTEGER,
ADD COLUMN     "x" DOUBLE PRECISION,
ADD COLUMN     "y" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "MassList" DROP COLUMN "code",
ADD COLUMN     "building" TEXT,
ADD COLUMN     "component" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "productName" TEXT,
ADD COLUMN     "tfm" TEXT,
ADD COLUMN     "typeCode" TEXT,
ADD COLUMN     "zone" TEXT,
ALTER COLUMN "projectId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "MassList" ADD CONSTRAINT "MassList_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
