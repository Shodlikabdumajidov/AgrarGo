-- AlterTable
ALTER TABLE "AgroNews" ADD COLUMN     "sourceName" TEXT,
ADD COLUMN     "sourceUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AgroNews_sourceUrl_key" ON "AgroNews"("sourceUrl");

