-- CreateEnum
CREATE TYPE "DriverPostStatus" AS ENUM ('AVAILABLE', 'ON_ROUTE');

-- CreateEnum
CREATE TYPE "TrailerType" AS ENUM ('DRY_VAN', 'REEFER', 'FLATBED', 'DROP_DECK', 'TENT', 'BOX_TRUCK', 'TIPPER', 'OTHER');

-- CreateEnum
CREATE TYPE "DriverExtra" AS ENUM ('LOADERS', 'TEMP_CONTROL', 'STRAPS_TARPS', 'LIFTGATE', 'GPS_247');

-- CreateTable
CREATE TABLE "DriverPost" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "status" "DriverPostStatus" NOT NULL DEFAULT 'AVAILABLE',
    "trailerType" "TrailerType" NOT NULL,
    "capacityKg" INTEGER NOT NULL,
    "routes" TEXT[],
    "workHours" TEXT,
    "currentLocation" TEXT NOT NULL,
    "pickupEtaMinutes" INTEGER,
    "pricePerKm" INTEGER,
    "priceNote" TEXT,
    "extras" "DriverExtra"[],
    "description" TEXT,
    "photos" TEXT[],
    "deliveryEtaAt" TIMESTAMP(3),
    "returnPickupAt" TIMESTAMP(3),
    "wantsBackhaul" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriverPost_isActive_status_createdAt_idx" ON "DriverPost"("isActive", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DriverPost_driverId_idx" ON "DriverPost"("driverId");

-- AddForeignKey
ALTER TABLE "DriverPost" ADD CONSTRAINT "DriverPost_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

