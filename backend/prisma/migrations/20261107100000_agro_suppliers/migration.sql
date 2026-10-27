-- CreateEnum
CREATE TYPE "AgroSupplierType" AS ENUM ('PHARMACY', 'FERTILIZER');

-- CreateEnum
CREATE TYPE "AgroVerification" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AgroMode" AS ENUM ('CROP', 'LIVESTOCK');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'AGRO_SUPPLIER';

-- CreateTable
CREATE TABLE "AgroSupplier" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AgroSupplierType" NOT NULL,
    "orgName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "stir" TEXT,
    "passportInfo" TEXT,
    "licenseDoc" TEXT,
    "stirDoc" TEXT,
    "verification" "AgroVerification" NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgroSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgroProduct" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "mode" "AgroMode" NOT NULL DEFAULT 'CROP',
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "usage" TEXT NOT NULL DEFAULT '',
    "price" DECIMAL(14,2) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'kg',
    "stockQty" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgroProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgroSupplier_userId_key" ON "AgroSupplier"("userId");

-- CreateIndex
CREATE INDEX "AgroSupplier_verification_idx" ON "AgroSupplier"("verification");

-- CreateIndex
CREATE INDEX "AgroProduct_supplierId_idx" ON "AgroProduct"("supplierId");

-- CreateIndex
CREATE INDEX "AgroProduct_mode_isActive_idx" ON "AgroProduct"("mode", "isActive");

-- AddForeignKey
ALTER TABLE "AgroSupplier" ADD CONSTRAINT "AgroSupplier_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgroProduct" ADD CONSTRAINT "AgroProduct_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "AgroSupplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

