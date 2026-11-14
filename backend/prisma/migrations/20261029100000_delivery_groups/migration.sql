-- AlterTable
ALTER TABLE "LocalOrder" ADD COLUMN     "deliveryGroupId" TEXT;

-- CreateIndex
CREATE INDEX "LocalOrder_deliveryGroupId_idx" ON "LocalOrder"("deliveryGroupId");

