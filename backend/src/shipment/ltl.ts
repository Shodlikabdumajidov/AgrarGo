import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normRegion } from '../trust/geo';

/**
 * LTL (qisman yuklar): haydovchining faol LTL e'lonidagi bo'sh joydan yuk og'irligini band qiladi.
 * Band qilish bitta SQL UPDATE bilan atomik: bo'sh joy yetmasa 0 qator o'zgaradi.
 * Haydovchida LTL e'lon bo'lmasa null qaytaradi (oddiy FTL oqimi).
 */
export async function reserveLtl(
  tx: Prisma.TransactionClient,
  driverId: string,
  shipment: { id: string; weightKg: Prisma.Decimal; originRegion: string; destRegion: string },
): Promise<{ postId: string; kg: number } | null> {
  const posts = await tx.driverPost.findMany({
    where: { driverId, isActive: true, loadMode: 'LTL' },
    select: { id: true, routes: true, availableCapacityKg: true },
  });
  if (!posts.length) return null;
  const kg = Math.ceil(Number(shipment.weightKg));
  const regions = [normRegion(shipment.originRegion), normRegion(shipment.destRegion)];
  const routeScore = (routes: string[]) => routes.some((r) => regions.some((g) => normRegion(r).includes(g))) ? 1 : 0;
  // Avval yo'nalishi mos e'lon, keyin bo'sh joyi ko'proq
  const ordered = [...posts].sort((a, b) => routeScore(b.routes) - routeScore(a.routes) || b.availableCapacityKg - a.availableCapacityKg);
  for (const p of ordered) {
    if (p.availableCapacityKg < kg) continue;
    const n = await tx.$executeRaw`UPDATE "DriverPost" SET "availableCapacityKg" = "availableCapacityKg" - ${kg} WHERE id = ${p.id} AND "availableCapacityKg" >= ${kg}`;
    if (n === 1) {
      await tx.shipment.update({ where: { id: shipment.id }, data: { ltlPostId: p.id, ltlKg: kg } });
      return { postId: p.id, kg };
    }
  }
  const best = Math.max(...posts.map((p) => p.availableCapacityKg));
  throw new ConflictException(`Mashinadagi bo'sh joy yetarli emas: ${best} kg bor, yuk ${kg} kg`);
}

/** Yuk qaytarilganda yoki yetkazilganda band qilingan joyni tiklaydi. Takroriy chaqiruv xavfsiz (bir marta tiklanadi). */
export async function restoreLtl(tx: Prisma.TransactionClient, shipmentId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ ltlPostId: string | null; ltlKg: number }[]>`
    WITH old AS (SELECT "ltlPostId", "ltlKg" FROM "Shipment" WHERE id = ${shipmentId} AND "ltlKg" IS NOT NULL FOR UPDATE)
    UPDATE "Shipment" s SET "ltlKg" = NULL FROM old WHERE s.id = ${shipmentId} RETURNING old."ltlPostId", old."ltlKg"`;
  const r = rows[0];
  if (!r || !r.ltlPostId) return;
  await tx.$executeRaw`UPDATE "DriverPost" SET "availableCapacityKg" = LEAST("maxCapacityKg", "availableCapacityKg" + ${r.ltlKg}) WHERE id = ${r.ltlPostId}`;
}
