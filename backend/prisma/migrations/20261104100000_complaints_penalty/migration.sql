-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('PENDING', 'UPHELD', 'PARTIAL', 'REJECTED', 'WITHDRAWN');

-- AlterEnum
ALTER TYPE "ProductStatus" ADD VALUE 'FROZEN';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "banReason" TEXT,
ADD COLUMN     "bannedAt" TIMESTAMP(3),
ADD COLUMN     "penaltyPoints" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "accusedId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'PENDING',
    "penalty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "decisionNote" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Complaint_reporterId_status_idx" ON "Complaint"("reporterId", "status");

-- CreateIndex
CREATE INDEX "Complaint_accusedId_status_idx" ON "Complaint"("accusedId", "status");

-- CreateIndex
CREATE INDEX "Complaint_status_createdAt_idx" ON "Complaint"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_accusedId_fkey" FOREIGN KEY ("accusedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

