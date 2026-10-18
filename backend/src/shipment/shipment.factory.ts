import { Prisma, ShipmentStatus } from '@prisma/client';

/** Tasdiqlangan bron uchun yuk tashish buyurtmasini yaratadi (bron tasdiqlangan tranzaksiya ichida chaqiriladi). */
export async function createShipmentForBooking(tx: Prisma.TransactionClient, bookingId: string) {
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: {
      quantityKg: true,
      marketId: true,
      urgent: true,
      product: {
        select: { name: true, category: true, farmerId: true, farmer: { select: { region: true, district: true, address: true } } },
      },
      market: { select: { region: true, district: true, address: true } },
    },
  });
  const from = booking.product.farmer;
  const to = booking.market;

  return tx.shipment.create({
    data: {
      bookingId,
      farmerId: booking.product.farmerId,
      marketId: booking.marketId,
      status: ShipmentStatus.OPEN,
      urgent: booking.urgent,
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

export interface WarehouseLocation {
  region: string;
  district: string;
  address: string | null;
}

/**
 * Yig'ilgan ombor buyurtmasi uchun yuk (OPEN) yaratadi: haydovchilar uni "Mavjud yuklar"da ko'radi.
 * Marshrut: omborxona -> market. Takroriy chaqiruv xavfsiz (warehouseOrderId unikal).
 */
export async function createShipmentForWarehouseOrder(tx: Prisma.TransactionClient, orderId: string, warehouse: WarehouseLocation) {
  const existing = await tx.shipment.findUnique({ where: { warehouseOrderId: orderId } });
  if (existing) return existing;
  const order = await tx.warehouseOrder.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      marketId: true,
      quantityKg: true,
      item: { select: { name: true, category: true, farmerId: true } },
      market: { select: { region: true, district: true, address: true } },
    },
  });
  return tx.shipment.create({
    data: {
      warehouseOrderId: orderId,
      farmerId: order.item.farmerId,
      marketId: order.marketId,
      status: ShipmentStatus.OPEN,
      cargoName: order.item.name,
      category: order.item.category,
      weightKg: order.quantityKg,
      originRegion: warehouse.region,
      originDistrict: warehouse.district,
      originAddress: warehouse.address,
      destRegion: order.market.region,
      destDistrict: order.market.district,
      destAddress: order.market.address,
      events: { create: { status: ShipmentStatus.OPEN } },
    },
  });
}
