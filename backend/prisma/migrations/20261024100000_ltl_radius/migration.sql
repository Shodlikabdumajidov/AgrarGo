-- Mavjud ma'lumotlarni xavfsiz ko'chirish: avval DEFAULT bilan, keyin to'ldirib, DEFAULT olib tashlanadi
-- CreateEnum
CREATE TYPE "LoadMode" AS ENUM ('FTL', 'LTL');

-- AlterTable
ALTER TABLE "DriverPost" ADD COLUMN "availableCapacityKg" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lat" DOUBLE PRECISION,
ADD COLUMN "lng" DOUBLE PRECISION,
ADD COLUMN "loadMode" "LoadMode" NOT NULL DEFAULT 'FTL',
ADD COLUMN "maxCapacityKg" INTEGER NOT NULL DEFAULT 0;

-- Mavjud e'lonlar: FTL, sig'im = eski capacityKg, joylashuv = haydovchi viloyati markazi
UPDATE "DriverPost" SET "maxCapacityKg" = "capacityKg", "availableCapacityKg" = "capacityKg";
UPDATE "DriverPost" p SET "lat" = CASE WHEN lower(d."region") = 'toshkent shahri' THEN 41.31 WHEN lower(d."region") = 'toshkent viloyati' THEN 41.47 WHEN lower(d."region") = 'andijon' THEN 40.78 WHEN lower(d."region") = 'buxoro' THEN 39.77 WHEN lower(d."region") = 'farg''ona' THEN 40.38 WHEN lower(d."region") = 'jizzax' THEN 40.12 WHEN lower(d."region") = 'namangan' THEN 41 WHEN lower(d."region") = 'navoiy' THEN 40.1 WHEN lower(d."region") = 'qashqadaryo' THEN 38.86 WHEN lower(d."region") = 'qoraqalpog''iston' THEN 42.46 WHEN lower(d."region") = 'samarqand' THEN 39.65 WHEN lower(d."region") = 'sirdaryo' THEN 40.49 WHEN lower(d."region") = 'surxondaryo' THEN 37.22 WHEN lower(d."region") = 'xorazm' THEN 41.55 END, "lng" = CASE WHEN lower(d."region") = 'toshkent shahri' THEN 69.24 WHEN lower(d."region") = 'toshkent viloyati' THEN 69.58 WHEN lower(d."region") = 'andijon' THEN 72.34 WHEN lower(d."region") = 'buxoro' THEN 64.42 WHEN lower(d."region") = 'farg''ona' THEN 71.78 WHEN lower(d."region") = 'jizzax' THEN 67.83 WHEN lower(d."region") = 'namangan' THEN 71.67 WHEN lower(d."region") = 'navoiy' THEN 65.37 WHEN lower(d."region") = 'qashqadaryo' THEN 65.79 WHEN lower(d."region") = 'qoraqalpog''iston' THEN 59.61 WHEN lower(d."region") = 'samarqand' THEN 66.96 WHEN lower(d."region") = 'sirdaryo' THEN 68.78 WHEN lower(d."region") = 'surxondaryo' THEN 67.28 WHEN lower(d."region") = 'xorazm' THEN 60.63 END FROM "Driver" d WHERE d."id" = p."driverId";

ALTER TABLE "DriverPost" ALTER COLUMN "availableCapacityKg" DROP DEFAULT, ALTER COLUMN "maxCapacityKg" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN "ltlKg" INTEGER,
ADD COLUMN "ltlPostId" TEXT,
ADD COLUMN "originLat" DOUBLE PRECISION,
ADD COLUMN "originLng" DOUBLE PRECISION;

-- Mavjud yuklar: yuk olinadigan viloyat markazi
UPDATE "Shipment" SET "originLat" = CASE WHEN lower("originRegion") = 'toshkent shahri' THEN 41.31 WHEN lower("originRegion") = 'toshkent viloyati' THEN 41.47 WHEN lower("originRegion") = 'andijon' THEN 40.78 WHEN lower("originRegion") = 'buxoro' THEN 39.77 WHEN lower("originRegion") = 'farg''ona' THEN 40.38 WHEN lower("originRegion") = 'jizzax' THEN 40.12 WHEN lower("originRegion") = 'namangan' THEN 41 WHEN lower("originRegion") = 'navoiy' THEN 40.1 WHEN lower("originRegion") = 'qashqadaryo' THEN 38.86 WHEN lower("originRegion") = 'qoraqalpog''iston' THEN 42.46 WHEN lower("originRegion") = 'samarqand' THEN 39.65 WHEN lower("originRegion") = 'sirdaryo' THEN 40.49 WHEN lower("originRegion") = 'surxondaryo' THEN 37.22 WHEN lower("originRegion") = 'xorazm' THEN 41.55 END, "originLng" = CASE WHEN lower("originRegion") = 'toshkent shahri' THEN 69.24 WHEN lower("originRegion") = 'toshkent viloyati' THEN 69.58 WHEN lower("originRegion") = 'andijon' THEN 72.34 WHEN lower("originRegion") = 'buxoro' THEN 64.42 WHEN lower("originRegion") = 'farg''ona' THEN 71.78 WHEN lower("originRegion") = 'jizzax' THEN 67.83 WHEN lower("originRegion") = 'namangan' THEN 71.67 WHEN lower("originRegion") = 'navoiy' THEN 65.37 WHEN lower("originRegion") = 'qashqadaryo' THEN 65.79 WHEN lower("originRegion") = 'qoraqalpog''iston' THEN 59.61 WHEN lower("originRegion") = 'samarqand' THEN 66.96 WHEN lower("originRegion") = 'sirdaryo' THEN 68.78 WHEN lower("originRegion") = 'surxondaryo' THEN 67.28 WHEN lower("originRegion") = 'xorazm' THEN 60.63 END;

-- CreateIndex
CREATE INDEX "DriverPost_lat_lng_idx" ON "DriverPost"("lat", "lng");

-- CreateIndex
CREATE INDEX "Shipment_originLat_originLng_idx" ON "Shipment"("originLat", "originLng");

-- CreateIndex
CREATE INDEX "Shipment_ltlPostId_idx" ON "Shipment"("ltlPostId");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_ltlPostId_fkey" FOREIGN KEY ("ltlPostId") REFERENCES "DriverPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Yaxlitlangan sig'im mantiqiy chegarasi
ALTER TABLE "DriverPost" ADD CONSTRAINT "DriverPost_capacity_check" CHECK ("availableCapacityKg" >= 0 AND "availableCapacityKg" <= "maxCapacityKg");
