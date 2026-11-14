-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "siteName" TEXT NOT NULL DEFAULT 'AgrarGo',
    "callCenterPhones" TEXT[],
    "supportEmail" TEXT,
    "telegramHandle" TEXT,
    "telegramUrl" TEXT,
    "instagramUrl" TEXT,
    "facebookUrl" TEXT,
    "youtubeUrl" TEXT,
    "workingHours" JSONB NOT NULL,
    "address" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- Yagona sozlamalar qatori: doim id = 1 va standart qiymatlar bilan mavjud
ALTER TABLE "SystemSettings" ADD CONSTRAINT "SystemSettings_single_row" CHECK ("id" = 1);
INSERT INTO "SystemSettings" ("id", "siteName", "callCenterPhones", "supportEmail", "telegramHandle", "telegramUrl", "workingHours", "address", "updatedAt")
VALUES (
  1, 'AgrarGo', ARRAY['+998 78 140 09 09'], 'info@agrargo.uz', '@agrargobot', 'https://t.me/agrargobot',
  '{"uz": "Du–Sh: 09:00–18:00", "ru": "Пн–Сб: 09:00–18:00", "en": "Mon–Sat: 09:00–18:00"}',
  '{"uz": "Samarqand, O''zbekiston", "ru": "Самарканд, Узбекистан", "en": "Samarkand, Uzbekistan"}',
  now()
) ON CONFLICT ("id") DO NOTHING;
