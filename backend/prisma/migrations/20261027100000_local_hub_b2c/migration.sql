-- CreateEnum
CREATE TYPE "HubMovementType" AS ENUM ('INTAKE', 'RESERVE', 'RELEASE', 'DISPATCH', 'RETURN', 'ADJUST');

-- CreateEnum
CREATE TYPE "HubIntakeStatus" AS ENUM ('ANNOUNCED', 'RECEIVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LocalOrderStatus" AS ENUM ('PENDING', 'PACKING', 'DELIVERING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SplitParty" AS ENUM ('FARMER', 'HUB', 'COURIER', 'PLATFORM');

-- CreateEnum
CREATE TYPE "SplitStatus" AS ENUM ('HELD', 'PAID', 'REFUNDED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'CONSUMER';

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "courierHubId" TEXT,
ADD COLUMN     "courierMode" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "hubFee" DECIMAL(20,2) NOT NULL DEFAULT 0,
ADD COLUMN     "localOrderId" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "hubId" TEXT,
ADD COLUMN     "isRetail" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "minOrderKg" DECIMAL(12,2),
ADD COLUMN     "retailPricePerKg" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "hubId" TEXT;

-- CreateTable
CREATE TABLE "Consumer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consumer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hub" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "district" TEXT,
    "address" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hub_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubStock" (
    "id" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "weightKg" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reservedKg" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubStockMovement" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "type" "HubMovementType" NOT NULL,
    "quantityKg" DECIMAL(12,2) NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubStockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubIntake" (
    "id" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "declaredKg" DECIMAL(12,2) NOT NULL,
    "receivedKg" DECIMAL(12,2),
    "status" "HubIntakeStatus" NOT NULL DEFAULT 'ANNOUNCED',
    "note" TEXT,
    "receivedById" TEXT,
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubIntake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalOrder" (
    "id" TEXT NOT NULL,
    "consumerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "courierId" TEXT,
    "quantityKg" DECIMAL(12,2) NOT NULL,
    "pricePerKg" DECIMAL(14,2) NOT NULL,
    "productAmount" DECIMAL(20,2) NOT NULL,
    "hubFee" DECIMAL(20,2) NOT NULL,
    "courierFee" DECIMAL(20,2) NOT NULL,
    "serviceFee" DECIMAL(20,2) NOT NULL,
    "totalPrice" DECIMAL(20,2) NOT NULL,
    "deliveryRegion" TEXT NOT NULL,
    "deliveryDistrict" TEXT NOT NULL,
    "deliveryAddress" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "note" TEXT,
    "deliveryCode" TEXT NOT NULL,
    "status" "LocalOrderStatus" NOT NULL DEFAULT 'PENDING',
    "packedAt" TIMESTAMP(3),
    "pickedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentSplit" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "party" "SplitParty" NOT NULL,
    "partyId" TEXT,
    "amount" DECIMAL(20,2) NOT NULL,
    "status" "SplitStatus" NOT NULL DEFAULT 'HELD',
    "ref" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentSplit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Consumer_userId_key" ON "Consumer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Hub_name_key" ON "Hub"("name");

-- CreateIndex
CREATE INDEX "Hub_region_isActive_idx" ON "Hub"("region", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "HubStock_hubId_productId_key" ON "HubStock"("hubId", "productId");

-- CreateIndex
CREATE INDEX "HubStockMovement_stockId_createdAt_idx" ON "HubStockMovement"("stockId", "createdAt");

-- CreateIndex
CREATE INDEX "HubStockMovement_refType_refId_idx" ON "HubStockMovement"("refType", "refId");

-- CreateIndex
CREATE INDEX "HubIntake_hubId_status_idx" ON "HubIntake"("hubId", "status");

-- CreateIndex
CREATE INDEX "HubIntake_farmerId_createdAt_idx" ON "HubIntake"("farmerId", "createdAt");

-- CreateIndex
CREATE INDEX "LocalOrder_consumerId_createdAt_idx" ON "LocalOrder"("consumerId", "createdAt");

-- CreateIndex
CREATE INDEX "LocalOrder_hubId_status_idx" ON "LocalOrder"("hubId", "status");

-- CreateIndex
CREATE INDEX "LocalOrder_farmerId_createdAt_idx" ON "LocalOrder"("farmerId", "createdAt");

-- CreateIndex
CREATE INDEX "LocalOrder_courierId_status_idx" ON "LocalOrder"("courierId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSplit_paymentId_party_key" ON "PaymentSplit"("paymentId", "party");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_localOrderId_key" ON "Payment"("localOrderId");

-- CreateIndex
CREATE INDEX "Product_isRetail_hubId_idx" ON "Product"("isRetail", "hubId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_courierHubId_fkey" FOREIGN KEY ("courierHubId") REFERENCES "Hub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consumer" ADD CONSTRAINT "Consumer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_localOrderId_fkey" FOREIGN KEY ("localOrderId") REFERENCES "LocalOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubStock" ADD CONSTRAINT "HubStock_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubStock" ADD CONSTRAINT "HubStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubStockMovement" ADD CONSTRAINT "HubStockMovement_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "HubStock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubIntake" ADD CONSTRAINT "HubIntake_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubIntake" ADD CONSTRAINT "HubIntake_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubIntake" ADD CONSTRAINT "HubIntake_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalOrder" ADD CONSTRAINT "LocalOrder_consumerId_fkey" FOREIGN KEY ("consumerId") REFERENCES "Consumer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalOrder" ADD CONSTRAINT "LocalOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalOrder" ADD CONSTRAINT "LocalOrder_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalOrder" ADD CONSTRAINT "LocalOrder_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSplit" ADD CONSTRAINT "PaymentSplit_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Chakana (B2C) modulining ma'lumot yaxlitligi qoidalari
-- To'lov manbasi endi uchtadan aynan bittasi: bron, ombor buyurtmasi yoki chakana buyurtma
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_single_source";
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_single_source" CHECK ((("bookingId" IS NOT NULL)::int + ("warehouseOrderId" IS NOT NULL)::int + ("localOrderId" IS NOT NULL)::int) = 1);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_hubfee_nonneg" CHECK ("hubFee" >= 0);
-- Hub qoldig'i: manfiy bo'lmaydi, zaxira mavjuddan oshmaydi
ALTER TABLE "HubStock" ADD CONSTRAINT "HubStock_weight_nonneg" CHECK ("weightKg" >= 0 AND "reservedKg" >= 0);
ALTER TABLE "HubStock" ADD CONSTRAINT "HubStock_reserved_le_weight" CHECK ("reservedKg" <= "weightKg");
ALTER TABLE "LocalOrder" ADD CONSTRAINT "LocalOrder_qty_positive" CHECK ("quantityKg" > 0);
-- Buyurtma summasi tarkibiy qismlar yig'indisiga teng
ALTER TABLE "LocalOrder" ADD CONSTRAINT "LocalOrder_total_sum" CHECK ("totalPrice" = "productAmount" + "hubFee" + "courierFee" + "serviceFee");
ALTER TABLE "PaymentSplit" ADD CONSTRAINT "PaymentSplit_amount_nonneg" CHECK ("amount" >= 0);
