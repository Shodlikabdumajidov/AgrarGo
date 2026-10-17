import { Prisma, ShipmentStatus } from '@prisma/client';

/** Tasdiqlangan bron uchun yuk tashish buyurtmasini yaratadi (bron tasdiqlangan tranzaksiya ichida chaqiriladi). */
export async function createShipmentForBooking(tx: Prisma.TransactionClient, bookingId: string) {
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: {
      quantityKg: true,
      product: {
        select: { name: true, category: true, farmer: { select: { region: true, district: true, address: true } } },
      },
      market: { select: { region: true, district: true, address: true } },
    },
  });
  const from = booking.product.farmer;
  const to = booking.market;

  return tx.shipment.create({
    data: {
      bookingId,
      status: ShipmentStatus.OPEN,
      cargoName: booking.product.name,
      category: booking.product.category,
      weightKg: booking.quantityKg,
      originRegion: from.region,
      originDistrict: from.district,
      originAddress: from.address,
      destRegion: to.region,
      destDistrict: to.district,
      destAddress: to.address,
      events: { create: { status: ShipmentStatus.OPEN } },
    },
  });
}
