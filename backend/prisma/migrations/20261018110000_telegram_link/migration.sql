-- AlterTable
ALTER TABLE "User" ADD COLUMN     "telegramAuthToken" TEXT,
ADD COLUMN     "telegramAuthTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "telegramChatId" TEXT,
ADD COLUMN     "telegramLinkedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User"("telegramChatId");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramAuthToken_key" ON "User"("telegramAuthToken");

