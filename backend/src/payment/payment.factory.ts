import { ConflictException } from '@nestjs/common';
import { DeliveryPayer, Prisma, PaymentStatus } from '@prisma/client';
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
    select: { quantityKg: true, pricePerKg: true, deliveryPayer: true, product: { select: { farmer: { select: { region: true } } } }, market: { select: { region: true } } },
  });
  const gross = computeAmount(booking.quantityKg, booking.pricePerKg);
  // To'lov tarkibi: mahsulot (fermerga) + yetkazib berish (haydovchiga) + xizmat haqi (platformaga)
  const q = pricing.quote(booking.product.farmer.region, booking.market.region, gross, booking.quantityKg);
  // Yetkazish FERMER hisobidan: yo'l haqi fermer oladigan summadan ushlanadi (market jami o'zgarmaydi: mahsulot narxi + xizmat haqi)
  const farmerPays = booking.deliveryPayer === DeliveryPayer.FARMER;
  if (farmerPays && q.deliveryFee.gte(gross)) throw new ConflictException("Yetkazib berish haqi mahsulot narxidan kam bo'lishi kerak (yetkazish fermer hisobidan). Narxni oshiring yoki yetkazishni xaridorga o'tkazing");
  const amount = farmerPays ? gross.sub(q.deliveryFee) : gross;
  return tx.payment.create({
    data: {
      bookingId,
      amount,
      deliveryPayer: booking.deliveryPayer,
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
