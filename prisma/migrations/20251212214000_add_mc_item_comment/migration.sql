-- CreateTable
CREATE TABLE "MCItemComment" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MCItemComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MCItemComment_itemId_idx" ON "MCItemComment"("itemId");

-- CreateIndex
CREATE INDEX "MCItemComment_userId_idx" ON "MCItemComment"("userId");

-- AddForeignKey
ALTER TABLE "MCItemComment" ADD CONSTRAINT "MCItemComment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MCProtocolItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MCItemComment" ADD CONSTRAINT "MCItemComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

