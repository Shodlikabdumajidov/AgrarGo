import { Prisma, PaymentStatus } from '@prisma/client';
import { PricingService } from '../pricing/pricing.service';

export const CURRENCY = 'UZS';

/** Summa serverda hisoblanadi (miqdor x bron paytida qotirilgan narx), mijozdan hech qachon olinmaydi. */
export function computeAmount(quantityKg: Prisma.Decimal.Value, pricePerKg: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(quantityKg).mul(pricePerKg).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Tasdiqlangan bron uchun kutilayotgan (PENDING) to'lov yaratadi; bron tasdiqlangan tranzaksiya ichida chaqiriladi. */
export async function createPaymentForBooking(tx: Prisma.TransactionClient, bookingId: string, pricing: PricingService) {
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: { quantityKg: true, pricePerKg: true, product: { select: { farmer: { select: { region: true } } } }, market: { select: { region: true } } },
  });
  const amount = computeAmount(booking.quantityKg, booking.pricePerKg);
  // To'lov tarkibi: mahsulot (fermerga) + yetkazib berish (haydovchiga) + xizmat haqi (platformaga)
  const q = pricing.quote(booking.product.farmer.region, booking.market.region, amount, booking.quantityKg);
  return tx.payment.create({
    data: {
      bookingId,
      amount,
      deliveryFee: q.deliveryFee,
      serviceFee: q.serviceFee,
      distanceKm: q.distanceKm,
      currency: CURRENCY,
      status: PaymentStatus.PENDING,
      provider: 'simulated',
      events: { create: { status: PaymentStatus.PENDING, actor: 'SYSTEM', note: 'Bron tasdiqlandi, to\'lov kutilmoqda' } },
    },
  });
}
