-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "chainId" TEXT,
ADD COLUMN     "chainSeq" INTEGER;

-- CreateIndex
CREATE INDEX "Shipment_chainId_idx" ON "Shipment"("chainId");

