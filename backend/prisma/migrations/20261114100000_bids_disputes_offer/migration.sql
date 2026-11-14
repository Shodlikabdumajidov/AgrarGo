-- CreateEnum
CREATE TYPE "BidStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "AgroProduct" ADD COLUMN     "offerAcceptedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "agreedDeliveryFee" DECIMAL(14,2),
ADD COLUMN     "disputeReason" TEXT,
ADD COLUMN     "disputedAt" TIMESTAMP(3),
ADD COLUMN     "disputedByRole" "Role";

-- CreateTable
CREATE TABLE "ShipmentBid" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "status" "BidStatus" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipmentBid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShipmentBid_shipmentId_status_idx" ON "ShipmentBid"("shipmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentBid_shipmentId_driverId_key" ON "ShipmentBid"("shipmentId", "driverId");

-- AddForeignKey
ALTER TABLE "ShipmentBid" ADD CONSTRAINT "ShipmentBid_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentBid" ADD CONSTRAINT "ShipmentBid_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

