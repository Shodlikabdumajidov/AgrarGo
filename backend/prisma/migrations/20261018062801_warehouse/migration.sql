-- CreateEnum
CREATE TYPE "WarehouseZone" AS ENUM ('INBOUND', 'STORAGE', 'SORTING', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "WarehouseItemStatus" AS ENUM ('ANNOUNCED', 'RECEIVED', 'ACTIVE', 'REJECTED', 'DEPLETED');

-- CreateEnum
CREATE TYPE "StorageType" AS ENUM ('DRY', 'COLD', 'VENTILATED');

-- CreateEnum
CREATE TYPE "QualityGrade" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "SizeClass" AS ENUM ('SMALL', 'MEDIUM', 'LARGE');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RECEIVE', 'INSPECT_REJECT', 'MOVE', 'SORT_WASTE', 'DISPATCH', 'ADJUST');

-- CreateEnum
CREATE TYPE "WarehouseOrderStatus" AS ENUM ('PENDING', 'PICKING', 'PICKED', 'DISPATCHED', 'DELIVERED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'DISPATCHER';

-- CreateTable
CREATE TABLE "StorageUnit" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "StorageType" NOT NULL,
    "capacityKg" DECIMAL(12,2) NOT NULL,
    "tempMinC" DOUBLE PRECISION NOT NULL,
    "tempMaxC" DOUBLE PRECISION NOT NULL,
    "humidityMin" DOUBLE PRECISION NOT NULL,
    "humidityMax" DOUBLE PRECISION NOT NULL,
    "currentTempC" DOUBLE PRECISION,
    "currentHumidity" DOUBLE PRECISION,
    "readingAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseItem" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "rfidTag" TEXT,
    "farmerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "photoUrl" TEXT,
    "storageType" "StorageType" NOT NULL,
    "zone" "WarehouseZone" NOT NULL DEFAULT 'INBOUND',
    "status" "WarehouseItemStatus" NOT NULL DEFAULT 'ANNOUNCED',
    "unitId" TEXT,
    "declaredWeightKg" DECIMAL(12,2) NOT NULL,
    "receivedWeightKg" DECIMAL(12,2),
    "weightKg" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reservedKg" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "rejectedKg" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pricePerKg" DECIMAL(14,2) NOT NULL,
    "grade" "QualityGrade",
    "inspectionNotes" TEXT,
    "inspectedAt" TIMESTAMP(3),
    "sizeClass" "SizeClass",
    "packagingType" TEXT,
    "packageWeightKg" DECIMAL(8,2),
    "receivedAt" TIMESTAMP(3),
    "storedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "deltaKg" DECIMAL(12,2) NOT NULL,
    "fromZone" "WarehouseZone",
    "toZone" "WarehouseZone",
    "note" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseOrder" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "driverId" TEXT,
    "quantityKg" DECIMAL(12,2) NOT NULL,
    "pricePerKg" DECIMAL(14,2) NOT NULL,
    "totalPrice" DECIMAL(20,2) NOT NULL,
    "note" TEXT,
    "status" "WarehouseOrderStatus" NOT NULL DEFAULT 'PENDING',
    "pickedAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StorageUnit_name_key" ON "StorageUnit"("name");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseItem_code_key" ON "WarehouseItem"("code");

-- CreateIndex
CREATE UNIQUE INDEX "WarehouseItem_rfidTag_key" ON "WarehouseItem"("rfidTag");

-- CreateIndex
CREATE INDEX "WarehouseItem_farmerId_createdAt_idx" ON "WarehouseItem"("farmerId", "createdAt");

-- CreateIndex
CREATE INDEX "WarehouseItem_zone_status_idx" ON "WarehouseItem"("zone", "status");

-- CreateIndex
CREATE INDEX "WarehouseItem_unitId_idx" ON "WarehouseItem"("unitId");

-- CreateIndex
CREATE INDEX "StockMovement_itemId_createdAt_idx" ON "StockMovement"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "WarehouseOrder_marketId_createdAt_idx" ON "WarehouseOrder"("marketId", "createdAt");

-- CreateIndex
CREATE INDEX "WarehouseOrder_itemId_status_idx" ON "WarehouseOrder"("itemId", "status");

-- CreateIndex
CREATE INDEX "WarehouseOrder_status_createdAt_idx" ON "WarehouseOrder"("status", "createdAt");

-- CreateIndex
CREATE INDEX "WarehouseOrder_driverId_status_idx" ON "WarehouseOrder"("driverId", "status");

-- AddForeignKey
ALTER TABLE "WarehouseItem" ADD CONSTRAINT "WarehouseItem_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseItem" ADD CONSTRAINT "WarehouseItem_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "StorageUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "WarehouseItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseOrder" ADD CONSTRAINT "WarehouseOrder_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "WarehouseItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseOrder" ADD CONSTRAINT "WarehouseOrder_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseOrder" ADD CONSTRAINT "WarehouseOrder_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Qoldiq hech qachon manfiy bo'lmasligi va zaxira mavjuddan oshmasligi bazada ham kafolatlanadi
ALTER TABLE "WarehouseItem" ADD CONSTRAINT "WarehouseItem_weight_nonneg" CHECK ("weightKg" >= 0 AND "reservedKg" >= 0 AND "rejectedKg" >= 0);
ALTER TABLE "WarehouseItem" ADD CONSTRAINT "WarehouseItem_reserved_le_weight" CHECK ("reservedKg" <= "weightKg");
ALTER TABLE "WarehouseOrder" ADD CONSTRAINT "WarehouseOrder_qty_positive" CHECK ("quantityKg" > 0);
