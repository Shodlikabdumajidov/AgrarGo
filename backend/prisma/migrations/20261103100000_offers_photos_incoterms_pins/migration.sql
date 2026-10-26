-- CreateEnum
CREATE TYPE "DeliveryPayer" AS ENUM ('BUYER', 'FARMER');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('PENDING', 'COUNTERED', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "deliveryPayer" "DeliveryPayer" NOT NULL DEFAULT 'BUYER';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "deliveryPayer" "DeliveryPayer" NOT NULL DEFAULT 'BUYER';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "deliveryPayer" "DeliveryPayer" NOT NULL DEFAULT 'BUYER',
ADD COLUMN     "photos" TEXT[];

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "deliveryPin" TEXT,
ADD COLUMN     "deliveryPinAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pickupPin" TEXT,
ADD COLUMN     "pickupPinAttempts" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PriceOffer" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "quantityKg" DECIMAL(12,2) NOT NULL,
    "pricePerKg" DECIMAL(12,2) NOT NULL,
    "message" TEXT,
    "counterPricePerKg" DECIMAL(12,2),
    "counterQuantityKg" DECIMAL(12,2),
    "counterMessage" TEXT,
    "status" "OfferStatus" NOT NULL DEFAULT 'PENDING',
    "bookingId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PriceOffer_bookingId_key" ON "PriceOffer"("bookingId");

-- CreateIndex
CREATE INDEX "PriceOffer_productId_status_idx" ON "PriceOffer"("productId", "status");

-- CreateIndex
CREATE INDEX "PriceOffer_marketId_status_idx" ON "PriceOffer"("marketId", "status");

-- AddForeignKey
ALTER TABLE "PriceOffer" ADD CONSTRAINT "PriceOffer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceOffer" ADD CONSTRAINT "PriceOffer_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceOffer" ADD CONSTRAINT "PriceOffer_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

