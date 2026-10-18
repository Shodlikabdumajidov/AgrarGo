-- CreateTable
CREATE TABLE "MarketPrice" (
    "id" TEXT NOT NULL,
    "marketName" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "priceToday" INTEGER NOT NULL,
    "priceYesterday" INTEGER NOT NULL,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketPrice_marketName_productName_createdAt_idx" ON "MarketPrice"("marketName", "productName", "createdAt");

