-- CreateEnum
CREATE TYPE "NewsCategory" AS ENUM ('ROADS', 'AGRO', 'MARKET', 'LOGISTICS');

-- CreateTable
CREATE TABLE "AgroNews" (
    "id" TEXT NOT NULL,
    "titleUz" TEXT NOT NULL,
    "titleRu" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "summaryUz" TEXT NOT NULL,
    "summaryRu" TEXT NOT NULL,
    "summaryEn" TEXT NOT NULL,
    "category" "NewsCategory" NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'Respublika',
    "aiInsightFarmerUz" TEXT NOT NULL,
    "aiInsightFarmerRu" TEXT NOT NULL,
    "aiInsightFarmerEn" TEXT NOT NULL,
    "aiInsightDriverUz" TEXT NOT NULL,
    "aiInsightDriverRu" TEXT NOT NULL,
    "aiInsightDriverEn" TEXT NOT NULL,
    "aiInsightMarketUz" TEXT NOT NULL,
    "aiInsightMarketRu" TEXT NOT NULL,
    "aiInsightMarketEn" TEXT NOT NULL,
    "aiSource" TEXT NOT NULL DEFAULT 'template',
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgroNews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgroNews_isActive_publishedAt_idx" ON "AgroNews"("isActive", "publishedAt");

-- CreateIndex
CREATE INDEX "AgroNews_category_idx" ON "AgroNews"("category");

-- CreateIndex
CREATE INDEX "AgroNews_region_idx" ON "AgroNews"("region");

