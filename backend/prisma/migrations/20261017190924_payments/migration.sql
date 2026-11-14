-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'HELD', 'RELEASED', 'REFUNDED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "ShipmentStatus" ADD VALUE 'CANCELLED';

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "heldAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "actor" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_bookingId_key" ON "Payment"("bookingId");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentEvent_paymentId_createdAt_idx" ON "PaymentEvent"("paymentId", "createdAt");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mavjud tasdiqlangan (APPROVED) bronlar uchun kutilayotgan (PENDING) to'lovlarni yaratish
INSERT INTO "Payment" ("id", "bookingId", "amount", "currency", "status", "provider", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, b."id", ROUND(b."quantityKg" * b."pricePerKg", 2), 'UZS', 'PENDING', 'simulated',
       COALESCE(b."decidedAt", NOW()), NOW()
FROM "Booking" b
WHERE b."status" = 'APPROVED';

INSERT INTO "PaymentEvent" ("id", "paymentId", "status", "actor", "note", "createdAt")
SELECT gen_random_uuid()::text, p."id", 'PENDING', 'SYSTEM', 'Migratsiya: mavjud tasdiqlangan bron', p."createdAt" FROM "Payment" p;
