-- CreateEnum
CREATE TYPE "CashbackType" AS ENUM ('EARNED', 'SPENT', 'REFUNDED');

-- AlterTable
ALTER TABLE "LocalCheckout" ADD COLUMN     "cashbackUsed" DECIMAL(20,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "LocalOrder" ADD COLUMN     "cashbackUsed" DECIMAL(20,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "cashbackUsed" DECIMAL(20,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "cashbackBalance" DECIMAL(20,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CashbackTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "type" "CashbackType" NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashbackTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashbackTransaction_userId_createdAt_idx" ON "CashbackTransaction"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CashbackTransaction_userId_type_sourceType_sourceId_key" ON "CashbackTransaction"("userId", "type", "sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "CashbackTransaction" ADD CONSTRAINT "CashbackTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Keshbek yaxlitligi: balans manfiy bo'lmaydi; ishlatilgan keshbek platforma xizmat haqidan oshmaydi (uchinchi tomon ulushlariga tegmaydi)
ALTER TABLE "User" ADD CONSTRAINT "User_cashback_nonneg" CHECK ("cashbackBalance" >= 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cashback_range" CHECK ("cashbackUsed" >= 0 AND "cashbackUsed" <= "serviceFee");
ALTER TABLE "LocalOrder" ADD CONSTRAINT "LocalOrder_cashback_range" CHECK ("cashbackUsed" >= 0 AND "cashbackUsed" <= "serviceFee");
ALTER TABLE "LocalCheckout" ADD CONSTRAINT "LocalCheckout_cashback_nonneg" CHECK ("cashbackUsed" >= 0);
ALTER TABLE "CashbackTransaction" ADD CONSTRAINT "CashbackTransaction_amount_positive" CHECK ("amount" > 0);
