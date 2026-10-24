-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'SAFETY_ADMIN', 'FINANCE_ADMIN', 'HUB_ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "EBolStatus" AS ENUM ('SIGNED', 'VOID');

-- AlterTable
ALTER TABLE "LocalOrder" ADD COLUMN     "isSigned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pickupOtp" TEXT,
ADD COLUMN     "pickupOtpAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pickupOtpExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "isSigned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pickupOtp" TEXT,
ADD COLUMN     "pickupOtpAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pickupOtpExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "adminRole" "AdminRole" NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE "EBolContract" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT,
    "localOrderId" TEXT,
    "driverId" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL,
    "status" "EBolStatus" NOT NULL DEFAULT 'SIGNED',
    "contractHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EBolContract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EBolContract_shipmentId_key" ON "EBolContract"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "EBolContract_localOrderId_key" ON "EBolContract"("localOrderId");

-- CreateIndex
CREATE INDEX "EBolContract_signedAt_idx" ON "EBolContract"("signedAt");

-- CreateIndex
CREATE INDEX "EBolContract_driverId_idx" ON "EBolContract"("driverId");

-- CreateIndex
CREATE INDEX "EBolContract_farmerId_idx" ON "EBolContract"("farmerId");

-- AddForeignKey
ALTER TABLE "EBolContract" ADD CONSTRAINT "EBolContract_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EBolContract" ADD CONSTRAINT "EBolContract_localOrderId_fkey" FOREIGN KEY ("localOrderId") REFERENCES "LocalOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EBolContract" ADD CONSTRAINT "EBolContract_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EBolContract" ADD CONSTRAINT "EBolContract_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "Farmer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Mavjud administratorlar to'liq huquqli (SUPER_ADMIN) bo'lib qoladi: hech narsa buzilmaydi
UPDATE "User" SET "adminRole" = 'SUPER_ADMIN' WHERE "role" = 'ADMIN';

-- RBAC yaxlitligi: administrator (role=ADMIN) albatta ichki rolga ega; boshqalarda adminRole = USER
ALTER TABLE "User" ADD CONSTRAINT "User_admin_role_consistent" CHECK (("role" = 'ADMIN') = ("adminRole" <> 'USER'));
-- e-BOL: aynan bitta manba (yuk yoki chakana buyurtma)
ALTER TABLE "EBolContract" ADD CONSTRAINT "EBolContract_single_source" CHECK ((("shipmentId" IS NOT NULL)::int + ("localOrderId" IS NOT NULL)::int) = 1);
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_otp_attempts" CHECK ("pickupOtpAttempts" >= 0);
ALTER TABLE "LocalOrder" ADD CONSTRAINT "LocalOrder_otp_attempts" CHECK ("pickupOtpAttempts" >= 0);
