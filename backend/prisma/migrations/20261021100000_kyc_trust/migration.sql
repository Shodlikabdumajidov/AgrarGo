-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NONE', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "KycDocType" AS ENUM ('ID_CARD', 'DRIVER_LICENSE', 'TECH_PASSPORT', 'FACE');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "urgent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "urgent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kycRejectReason" TEXT,
ADD COLUMN     "kycStatus" "KycStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "KycDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "KycDocType" NOT NULL,
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KycDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentRating" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "friendly" BOOLEAN NOT NULL DEFAULT false,
    "damaged" BOOLEAN NOT NULL DEFAULT false,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KycDocument_userId_type_key" ON "KycDocument"("userId", "type");

-- CreateIndex
CREATE INDEX "ShipmentRating_targetId_stars_idx" ON "ShipmentRating"("targetId", "stars");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentRating_shipmentId_raterId_targetId_key" ON "ShipmentRating"("shipmentId", "raterId", "targetId");

-- AddForeignKey
ALTER TABLE "KycDocument" ADD CONSTRAINT "KycDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentRating" ADD CONSTRAINT "ShipmentRating_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentRating" ADD CONSTRAINT "ShipmentRating_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentRating" ADD CONSTRAINT "ShipmentRating_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

