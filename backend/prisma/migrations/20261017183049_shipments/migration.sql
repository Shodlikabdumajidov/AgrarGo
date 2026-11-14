-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('OPEN', 'LOADING', 'IN_TRANSIT', 'DELIVERED');

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "driverId" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'OPEN',
    "cargoName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "weightKg" DECIMAL(12,2) NOT NULL,
    "originRegion" TEXT NOT NULL,
    "originDistrict" TEXT NOT NULL,
    "originAddress" TEXT,
    "destRegion" TEXT NOT NULL,
    "destDistrict" TEXT NOT NULL,
    "destAddress" TEXT,
    "assignedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentEvent" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_bookingId_key" ON "Shipment"("bookingId");

-- CreateIndex
CREATE INDEX "Shipment_status_createdAt_idx" ON "Shipment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Shipment_driverId_status_idx" ON "Shipment"("driverId", "status");

-- CreateIndex
CREATE INDEX "ShipmentEvent_shipmentId_createdAt_idx" ON "ShipmentEvent"("shipmentId", "createdAt");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mavjud tasdiqlangan (APPROVED) bronlar uchun yuk tashish buyurtmalarini yaratish
INSERT INTO "Shipment" ("id", "bookingId", "status", "cargoName", "category", "weightKg",
  "originRegion", "originDistrict", "originAddress", "destRegion", "destDistrict", "destAddress", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, b."id", 'OPEN', p."name", p."category", b."quantityKg",
  f."region", f."district", f."address", m."region", m."district", m."address",
  COALESCE(b."decidedAt", NOW()), NOW()
FROM "Booking" b
JOIN "Product" p ON p."id" = b."productId"
JOIN "Farmer" f ON f."id" = p."farmerId"
JOIN "Market" m ON m."id" = b."marketId"
WHERE b."status" = 'APPROVED';

INSERT INTO "ShipmentEvent" ("id", "shipmentId", "status", "createdAt")
SELECT gen_random_uuid()::text, s."id", 'OPEN', s."createdAt" FROM "Shipment" s;
