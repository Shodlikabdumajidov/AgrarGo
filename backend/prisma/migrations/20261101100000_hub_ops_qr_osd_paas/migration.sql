-- CreateEnum
CREATE TYPE "PackagingStatus" AS ENUM ('NONE', 'PENDING', 'DONE');

-- CreateEnum
CREATE TYPE "OsdType" AS ENUM ('DAMAGED', 'SHORT');

-- AlterTable
ALTER TABLE "Hub" ADD COLUMN     "packagingFeePerKg" DECIMAL(14,2) NOT NULL DEFAULT 200;

-- AlterTable
ALTER TABLE "HubIntake" ADD COLUMN     "boxCount" INTEGER,
ADD COLUMN     "damagedBoxes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "masterQr" TEXT,
ADD COLUMN     "masterQrAt" TIMESTAMP(3),
ADD COLUMN     "packagedAt" TIMESTAMP(3),
ADD COLUMN     "packagedById" TEXT,
ADD COLUMN     "packagingFee" DECIMAL(20,2),
ADD COLUMN     "packagingRate" DECIMAL(14,2),
ADD COLUMN     "packagingStatus" "PackagingStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "usePackaging" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "HubOsd" (
    "id" TEXT NOT NULL,
    "intakeId" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "type" "OsdType" NOT NULL,
    "totalBoxes" INTEGER,
    "damagedBoxes" INTEGER,
    "expectedKg" DECIMAL(12,2) NOT NULL,
    "receivedKg" DECIMAL(12,2) NOT NULL,
    "lossKg" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "reportedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubOsd_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HubOsd_intakeId_key" ON "HubOsd"("intakeId");

-- CreateIndex
CREATE INDEX "HubOsd_hubId_createdAt_idx" ON "HubOsd"("hubId", "createdAt");

-- CreateIndex
CREATE INDEX "HubOsd_farmerId_idx" ON "HubOsd"("farmerId");

-- CreateIndex
CREATE UNIQUE INDEX "HubIntake_masterQr_key" ON "HubIntake"("masterQr");

-- CreateIndex
CREATE INDEX "HubIntake_hubId_packagingStatus_idx" ON "HubIntake"("hubId", "packagingStatus");

-- AddForeignKey
ALTER TABLE "HubOsd" ADD CONSTRAINT "HubOsd_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "HubIntake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubOsd" ADD CONSTRAINT "HubOsd_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Ma'lumot yaxlitligi: quti soni musbat, yaroqsizlari 0..boxCount, qadoqlash narxi manfiy emas
ALTER TABLE "HubIntake" ADD CONSTRAINT "HubIntake_boxCount_positive" CHECK ("boxCount" IS NULL OR "boxCount" > 0);
ALTER TABLE "HubIntake" ADD CONSTRAINT "HubIntake_damagedBoxes_range" CHECK ("damagedBoxes" >= 0 AND ("boxCount" IS NULL OR "damagedBoxes" <= "boxCount"));
ALTER TABLE "Hub" ADD CONSTRAINT "Hub_packagingFee_nonneg" CHECK ("packagingFeePerKg" >= 0);
ALTER TABLE "HubOsd" ADD CONSTRAINT "HubOsd_amounts_nonneg" CHECK ("lossKg" >= 0 AND "receivedKg" >= 0 AND "expectedKg" >= 0);
