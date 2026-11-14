import { Prisma, ProductStatus } from '@prisma/client';

/** Bekor qilingan/rad etilgan bron miqdorini e'longa qaytaradi. Qoldiq tugagani uchun BOOKED bo'lgan e'lon qayta faol bo'ladi (arxivlanganiga tegilmaydi). */
export async function restoreStock(tx: Prisma.TransactionClient, productId: string, quantityKg: Prisma.Decimal) {
  await tx.product.update({ where: { id: productId }, data: { quantityKg: { increment: quantityKg } } });
  await tx.product.updateMany({
    where: { id: productId, status: ProductStatus.BOOKED },
    data: { status: ProductStatus.ACTIVE },
  });
}
