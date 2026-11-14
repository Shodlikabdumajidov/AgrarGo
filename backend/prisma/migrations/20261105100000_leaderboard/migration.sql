-- CreateEnum
CREATE TYPE "LeaderboardCategory" AS ENUM ('DRIVER', 'FARMER', 'MARKET');

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "monthlyKm" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Farmer" ADD COLUMN     "monthlySotuvTons" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Market" ADD COLUMN     "monthlyOrders" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "monthlyXaridTons" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "statsCounted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "proUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LeaderboardState" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "activeMonth" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaderboardState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaderboardWinner" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "category" "LeaderboardCategory" NOT NULL,
    "rank" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "proUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaderboardWinner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaderboardWinner_month_idx" ON "LeaderboardWinner"("month");

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardWinner_month_category_rank_key" ON "LeaderboardWinner"("month", "category", "rank");

