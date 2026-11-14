import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const MAX_ATTEMPTS = 3;
// P2034 (yozuv to'qnashuvi) yoki xom so'rovdan kelgan serializatsiya/deadlock xatosi (SQLSTATE 40001 / 40P01)
const retryable = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && (e.code === 'P2034' || /could not serialize|deadlock detected|40001|40P01|write conflict/i.test(`${e.message} ${JSON.stringify(e.meta ?? {})}`));

/**
 * Moliyaviy tranzaksiya: barcha yozuvlar yoki hammasi saqlanadi, yoki hech biri (xato bo'lsa to'liq rollback).
 *  - ulanish/tranzaksiya vaqt chegaralari (osilib qolmasin);
 *  - deadlock / serializatsiya to'qnashuvida (P2034) avtomatik qayta urinish. Qayta urinish xavfsiz: oldingi urinish to'liq qaytarilgan,
 *    provayderga so'rovlar esa deterministik (idempotent) kalit bilan ketadi, shuning uchun pul ikki marta harakatlanmaydi.
 *  - serializable: bir vaqtdagi qarama-qarshi moliyaviy o'zgarishlar (masalan, ikki parallel qaytarish) ketma-ket bajariladi.
 */
export async function moneyTx<T>(prisma: PrismaService, fn: (tx: Prisma.TransactionClient) => Promise<T>, opts: { serializable?: boolean } = {}): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        maxWait: 10_000, timeout: 30_000,
        ...(opts.serializable && { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
      });
    } catch (e) {
      if (!retryable(e) || attempt >= MAX_ATTEMPTS) throw e;
      await new Promise((r) => setTimeout(r, 40 * attempt + Math.floor(Math.random() * 40)));
    }
  }
}
