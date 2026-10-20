-- CreateEnum
CREATE TYPE "DockPurpose" AS ENUM ('INTAKE', 'PICKUP');

-- CreateEnum
CREATE TYPE "DockApptStatus" AS ENUM ('BOOKED', 'ARRIVED', 'DONE', 'CANCELLED', 'NO_SHOW');

-- AlterTable
ALTER TABLE "Hub" ADD COLUMN     "dockCloseMin" INTEGER NOT NULL DEFAULT 1200,
ADD COLUMN     "dockOpenMin" INTEGER NOT NULL DEFAULT 360,
ADD COLUMN     "requireDockBooking" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slotMinutes" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "LocalOrder" ADD COLUMN     "checkoutId" TEXT,
ADD COLUMN     "pickupApptId" TEXT;

-- CreateTable
CREATE TABLE "LocalCheckout" (
    "id" TEXT NOT NULL,
    "consumerId" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "totalPrice" DECIMAL(20,2) NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "providerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocalCheckout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubDock" (
    "id" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubDock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DockAppointment" (
    "id" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "dockId" TEXT NOT NULL,
    "purpose" "DockPurpose" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "DockApptStatus" NOT NULL DEFAULT 'BOOKED',
    "slotLock" TEXT DEFAULT 'A',
    "bookedById" TEXT NOT NULL,
    "vehiclePlate" TEXT,
    "note" TEXT,
    "cancelReason" TEXT,
    "arrivedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "intakeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DockAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LocalCheckout_consumerId_createdAt_idx" ON "LocalCheckout"("consumerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LocalCheckout_consumerId_idempotencyKey_key" ON "LocalCheckout"("consumerId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "HubDock_hubId_number_key" ON "HubDock"("hubId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "DockAppointment_intakeId_key" ON "DockAppointment"("intakeId");

-- CreateIndex
CREATE INDEX "DockAppointment_hubId_startsAt_idx" ON "DockAppointment"("hubId", "startsAt");

-- CreateIndex
CREATE INDEX "DockAppointment_bookedById_startsAt_idx" ON "DockAppointment"("bookedById", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "DockAppointment_dockId_startsAt_slotLock_key" ON "DockAppointment"("dockId", "startsAt", "slotLock");

-- CreateIndex
CREATE INDEX "LocalOrder_checkoutId_idx" ON "LocalOrder"("checkoutId");

-- CreateIndex
CREATE INDEX "LocalOrder_pickupApptId_idx" ON "LocalOrder"("pickupApptId");

-- AddForeignKey
ALTER TABLE "LocalOrder" ADD CONSTRAINT "LocalOrder_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "LocalCheckout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalOrder" ADD CONSTRAINT "LocalOrder_pickupApptId_fkey" FOREIGN KEY ("pickupApptId") REFERENCES "DockAppointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalCheckout" ADD CONSTRAINT "LocalCheckout_consumerId_fkey" FOREIGN KEY ("consumerId") REFERENCES "Consumer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubDock" ADD CONSTRAINT "HubDock_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DockAppointment" ADD CONSTRAINT "DockAppointment_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DockAppointment" ADD CONSTRAINT "DockAppointment_dockId_fkey" FOREIGN KEY ("dockId") REFERENCES "HubDock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DockAppointment" ADD CONSTRAINT "DockAppointment_bookedById_fkey" FOREIGN KEY ("bookedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DockAppointment" ADD CONSTRAINT "DockAppointment_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "HubIntake"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Rampa jadvali va savat yaxlitligi qoidalari (faqat qo'shimcha: mavjud ma'lumotlarga tegmaydi)
ALTER TABLE "Hub" ADD CONSTRAINT "Hub_dock_hours" CHECK ("slotMinutes" BETWEEN 10 AND 240 AND "dockOpenMin" >= 0 AND "dockCloseMin" <= 1440 AND "dockOpenMin" < "dockCloseMin");
ALTER TABLE "HubDock" ADD CONSTRAINT "HubDock_number_positive" CHECK ("number" > 0);
ALTER TABLE "DockAppointment" ADD CONSTRAINT "DockAppointment_range" CHECK ("endsAt" > "startsAt");
-- faol (BOOKED/ARRIVED) yozuvdagina slotLock to'ldirilgan: bir rampada bir vaqtda bitta faol yozuv
ALTER TABLE "DockAppointment" ADD CONSTRAINT "DockAppointment_lock_matches_status" CHECK (("status" IN ('BOOKED','ARRIVED')) = ("slotLock" IS NOT NULL));
ALTER TABLE "LocalCheckout" ADD CONSTRAINT "LocalCheckout_positive" CHECK ("totalPrice" > 0 AND "itemCount" > 0);
