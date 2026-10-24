-- CreateEnum
CREATE TYPE "LocationSource" AS ENUM ('GPS', 'SIMULATED');

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "lastLat" DOUBLE PRECISION,
ADD COLUMN     "lastLng" DOUBLE PRECISION,
ADD COLUMN     "lastLocationAt" TIMESTAMP(3),
ADD COLUMN     "lastLocationSource" "LocationSource",
ADD COLUMN     "lastSpeedKmh" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "LocationLog" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "speedKmh" DOUBLE PRECISION,
    "accuracyM" DOUBLE PRECISION,
    "source" "LocationSource" NOT NULL DEFAULT 'GPS',
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LocationLog_driverId_recordedAt_idx" ON "LocationLog"("driverId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LocationLog_shipmentId_recordedAt_key" ON "LocationLog"("shipmentId", "recordedAt");

-- AddForeignKey
ALTER TABLE "LocationLog" ADD CONSTRAINT "LocationLog_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationLog" ADD CONSTRAINT "LocationLog_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Koordinatalar haqiqiy diapazonda bo'lishi bazada ham kafolatlanadi
ALTER TABLE "LocationLog" ADD CONSTRAINT "LocationLog_lat_range" CHECK ("lat" BETWEEN -90 AND 90);
ALTER TABLE "LocationLog" ADD CONSTRAINT "LocationLog_lng_range" CHECK ("lng" BETWEEN -180 AND 180);
