-- CreateEnum
CREATE TYPE "AdjustmentKind" AS ENUM ('DAMAGE', 'PACKAGING', 'DISPUTE');

-- AlterTable
ALTER TABLE "HubIntake" ADD COLUMN     "packagingPaid" DECIMAL(20,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "HubOsd" ADD COLUMN     "localOrderId" TEXT,
ADD COLUMN     "refundAmount" DECIMAL(20,2),
ALTER COLUMN "intakeId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "refundedAmount" DECIMAL(20,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PaymentAdjustment" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" "AdjustmentKind" NOT NULL,
    "intakeId" TEXT,
    "totalBoxes" INTEGER,
    "damagedBoxes" INTEGER,
    "goodsAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "deliveryAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "serviceAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "refundAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "transferAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "providerRef" TEXT,
    "actor" TEXT NOT NULL,
    "actorUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentAdjustment_kind_createdAt_idx" ON "PaymentAdjustment"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentAdjustment_intakeId_idx" ON "PaymentAdjustment"("intakeId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAdjustment_paymentId_seq_key" ON "PaymentAdjustment"("paymentId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "HubOsd_localOrderId_key" ON "HubOsd"("localOrderId");

-- AddForeignKey
ALTER TABLE "HubOsd" ADD CONSTRAINT "HubOsd_localOrderId_fkey" FOREIGN KEY ("localOrderId") REFERENCES "LocalOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAdjustment" ADD CONSTRAINT "PaymentAdjustment_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Moliyaviy yaxlitlik (ikkinchi qatlam himoya: ilova xatosi bo'lsa ham baza noto'g'ri summani qabul qilmaydi)
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amounts_nonneg" CHECK ("amount" >= 0 AND "deliveryFee" >= 0 AND "serviceFee" >= 0 AND "hubFee" >= 0 AND "refundedAmount" >= 0);
ALTER TABLE "PaymentAdjustment" ADD CONSTRAINT "PaymentAdjustment_amounts_nonneg" CHECK ("goodsAmount" >= 0 AND "deliveryAmount" >= 0 AND "serviceAmount" >= 0 AND "refundAmount" >= 0 AND "transferAmount" >= 0);
ALTER TABLE "HubIntake" ADD CONSTRAINT "HubIntake_packagingPaid_range" CHECK ("packagingPaid" >= 0 AND ("packagingFee" IS NULL OR "packagingPaid" <= "packagingFee"));
ALTER TABLE "HubOsd" ADD CONSTRAINT "HubOsd_single_source" CHECK (("intakeId" IS NULL) <> ("localOrderId" IS NULL));
