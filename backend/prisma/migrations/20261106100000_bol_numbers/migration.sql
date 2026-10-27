-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "bolNo" SERIAL NOT NULL,
ADD COLUMN     "deliveryPinVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "pickupPinVerifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_bolNo_key" ON "Shipment"("bolNo");

