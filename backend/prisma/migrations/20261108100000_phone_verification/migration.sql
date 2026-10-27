-- CreateTable
CREATE TABLE "PhoneVerification" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "tokenHash" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhoneVerification_tokenHash_key" ON "PhoneVerification"("tokenHash");

-- CreateIndex
CREATE INDEX "PhoneVerification_phone_createdAt_idx" ON "PhoneVerification"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "PhoneVerification_createdAt_idx" ON "PhoneVerification"("createdAt");

