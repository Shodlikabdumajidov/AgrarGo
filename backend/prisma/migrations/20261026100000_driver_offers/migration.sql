-- AlterTable
ALTER TABLE "User" ADD COLUMN     "telegramUsername" TEXT;

-- CreateTable
CREATE TABLE "DriverOffer" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "pickupAt" TIMESTAMP(3),
    "note" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriverOffer_postId_createdAt_idx" ON "DriverOffer"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "DriverOffer_fromUserId_idx" ON "DriverOffer"("fromUserId");

-- CreateIndex
CREATE UNIQUE INDEX "DriverOffer_postId_shipmentId_key" ON "DriverOffer"("postId", "shipmentId");

-- AddForeignKey
ALTER TABLE "DriverOffer" ADD CONSTRAINT "DriverOffer_postId_fkey" FOREIGN KEY ("postId") REFERENCES "DriverPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverOffer" ADD CONSTRAINT "DriverOffer_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverOffer" ADD CONSTRAINT "DriverOffer_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

