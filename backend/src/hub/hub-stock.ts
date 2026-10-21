import { ConflictException } from '@nestjs/common';
import { HubMovementType, Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

/**
 * Hub qoldig'i bilan barcha amallar shu yerda: har biri bitta atomik SQL (qoldiq hech qachon manfiy bo'lmaydi,
 * zaxira mavjuddan oshmaydi) + harakatlar jurnaliga yozuv. DB'da ham CHECK cheklovlari bor (ikki qatlamli himoya).
 */
async function log(tx: Tx, stockId: string, type: HubMovementType, qty: Prisma.Decimal.Value, ref?: { type: string; id: string }, note?: string) {
  await tx.hubStockMovement.create({ data: { stockId, type, quantityKg: D(qty), refType: ref?.type ?? null, refId: ref?.id ?? null, note: note ?? null } });
}

/** Fermerdan qabul qilingan miqdor omborga qo'shiladi */
export async function addStock(tx: Tx, hubId: string, productId: string, qty: Prisma.Decimal.Value, ref?: { type: string; id: string }, note?: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "HubStock" (id, "hubId", "productId", "weightKg", "reservedKg", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, ${hubId}, ${productId}, ${D(qty)}, 0, now(), now())
    ON CONFLICT ("hubId", "productId") DO UPDATE SET "weightKg" = "HubStock"."weightKg" + ${D(qty)}, "updatedAt" = now()
    RETURNING id`;
  await log(tx, rows[0].id, HubMovementType.INTAKE, qty, ref, note);
  return rows[0].id;
}

/** Buyurtma uchun zaxira: faqat bo'sh (mavjud - zaxira) qoldiq yetsa o'tadi */
export async function reserveStock(tx: Tx, hubId: string, productId: string, qty: Prisma.Decimal.Value, orderId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "HubStock" SET "reservedKg" = "reservedKg" + ${D(qty)}, "updatedAt" = now()
    WHERE "hubId" = ${hubId} AND "productId" = ${productId} AND "weightKg" - "reservedKg" >= ${D(qty)}
    RETURNING id`;
  if (!rows.length) throw new ConflictException("Hub omborida buyurtma uchun yetarli qoldiq yo'q. Miqdorni kamaytiring yoki keyinroq urinib ko'ring");
  await log(tx, rows[0].id, HubMovementType.RESERVE, qty, { type: 'LOCAL_ORDER', id: orderId });
}

/** Buyurtma bekor bo'ldi (kuryer olmagan): zaxira bo'shaydi */
export async function releaseReserve(tx: Tx, hubId: string, productId: string, qty: Prisma.Decimal.Value, orderId: string, note?: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "HubStock" SET "reservedKg" = "reservedKg" - ${D(qty)}, "updatedAt" = now()
    WHERE "hubId" = ${hubId} AND "productId" = ${productId} AND "reservedKg" >= ${D(qty)} RETURNING id`;
  if (!rows.length) throw new ConflictException('Hub qoldig\'i va zaxirasi mos kelmaydi. Administratorga murojaat qiling');
  await log(tx, rows[0].id, HubMovementType.RELEASE, qty, { type: 'LOCAL_ORDER', id: orderId }, note);
}

/** Kuryer olib ketdi: mavjud qoldiq ham, zaxira ham kamayadi (jismonan ombordan chiqdi) */
export async function dispatchStock(tx: Tx, hubId: string, productId: string, qty: Prisma.Decimal.Value, orderId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "HubStock" SET "weightKg" = "weightKg" - ${D(qty)}, "reservedKg" = "reservedKg" - ${D(qty)}, "updatedAt" = now()
    WHERE "hubId" = ${hubId} AND "productId" = ${productId} AND "reservedKg" >= ${D(qty)} AND "weightKg" >= ${D(qty)} RETURNING id`;
  if (!rows.length) throw new ConflictException('Hub qoldig\'i va zaxirasi mos kelmaydi. Administratorga murojaat qiling');
  await log(tx, rows[0].id, HubMovementType.DISPATCH, qty, { type: 'LOCAL_ORDER', id: orderId });
}

/** Yo'ldagi buyurtma bekor bo'ldi: yuk omborga qaytdi */
export async function returnStock(tx: Tx, hubId: string, productId: string, qty: Prisma.Decimal.Value, orderId: string, note?: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "HubStock" SET "weightKg" = "weightKg" + ${D(qty)}, "updatedAt" = now()
    WHERE "hubId" = ${hubId} AND "productId" = ${productId} RETURNING id`;
  if (!rows.length) throw new ConflictException('Hub qoldig\'i topilmadi');
  await log(tx, rows[0].id, HubMovementType.RETURN, qty, { type: 'LOCAL_ORDER', id: orderId }, note);
}

/** Qo'lda tuzatish (yaroqsiz mahsulot va h.k.): faqat zaxiralanmagan qismdan kamaytirish mumkin */
export async function adjustStock(tx: Tx, stockId: string, deltaKg: Prisma.Decimal.Value, note: string) {
  const delta = D(deltaKg);
  const rows = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "HubStock" SET "weightKg" = "weightKg" + ${delta}, "updatedAt" = now()
    WHERE id = ${stockId} AND "weightKg" + ${delta} >= "reservedKg" RETURNING id`;
  if (!rows.length) throw new ConflictException("Qoldiq zaxiralangan miqdordan kam bo'lib qolmasligi kerak");
  await log(tx, stockId, HubMovementType.ADJUST, delta, undefined, note);
}

/** Zaxiralangan, lekin yaroqsiz chiqqan qism: ham mavjud qoldiq, ham zaxira kamayadi (ombordan hisobdan chiqariladi) */
export async function writeOffReserved(tx: Tx, hubId: string, productId: string, qty: Prisma.Decimal.Value, orderId: string, note?: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "HubStock" SET "weightKg" = "weightKg" - ${D(qty)}, "reservedKg" = "reservedKg" - ${D(qty)}, "updatedAt" = now()
    WHERE "hubId" = ${hubId} AND "productId" = ${productId} AND "reservedKg" >= ${D(qty)} AND "weightKg" >= ${D(qty)} RETURNING id`;
  if (!rows.length) throw new ConflictException("Hub qoldig'i va zaxirasi mos kelmaydi. Administratorga murojaat qiling");
  await log(tx, rows[0].id, HubMovementType.ADJUST, D(qty).neg(), { type: 'LOCAL_ORDER_DAMAGE', id: orderId }, note);
}
