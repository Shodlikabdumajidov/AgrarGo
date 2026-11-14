-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "feeAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
ADD COLUMN     "warehouseOrderId" TEXT,
ALTER COLUMN "bookingId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "farmerId" TEXT,
ADD COLUMN     "marketId" TEXT,
ADD COLUMN     "warehouseOrderId" TEXT,
ALTER COLUMN "bookingId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SystemSettings" ADD COLUMN     "warehouseAddress" TEXT,
ADD COLUMN     "warehouseDistrict" TEXT NOT NULL DEFAULT 'Samarqand shahri',
ADD COLUMN     "warehouseRegion" TEXT NOT NULL DEFAULT 'Samarqand';

-- CreateIndex
CREATE UNIQUE INDEX "Payment_warehouseOrderId_key" ON "Payment"("warehouseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_warehouseOrderId_key" ON "Shipment"("warehouseOrderId");

-- CreateIndex
CREATE INDEX "Shipment_farmerId_status_idx" ON "Shipment"("farmerId", "status");

-- CreateIndex
CREATE INDEX "Shipment_marketId_status_idx" ON "Shipment"("marketId", "status");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_warehouseOrderId_fkey" FOREIGN KEY ("warehouseOrderId") REFERENCES "WarehouseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_warehouseOrderId_fkey" FOREIGN KEY ("warehouseOrderId") REFERENCES "WarehouseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Mavjud yuklar: egalar bron orqali to'ldiriladi, so'ng majburiy qilinadi
UPDATE "Shipment" s SET "farmerId" = p."farmerId", "marketId" = b."marketId"
FROM "Booking" b JOIN "Product" p ON p.id = b."productId" WHERE s."bookingId" = b.id;
ALTER TABLE "Shipment" ALTER COLUMN "farmerId" SET NOT NULL;
ALTER TABLE "Shipment" ALTER COLUMN "marketId" SET NOT NULL;

-- Yuk va to'lov manbai aynan bitta: bron YOKI ombor buyurtmasi
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_single_source" CHECK (("bookingId" IS NOT NULL) <> ("warehouseOrderId" IS NOT NULL));
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_single_source" CHECK (("bookingId" IS NOT NULL) <> ("warehouseOrderId" IS NOT NULL));
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_fee_range" CHECK ("feeAmount" >= 0 AND "feeAmount" <= "amount");
