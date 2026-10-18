import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, Prisma, ProductStatus } from '@prisma/client';
import { NotificationService } from '../telegram/notification.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPaymentForBooking } from '../payment/payment.factory';
import { createShipmentForBooking } from '../shipment/shipment.factory';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ListBookingsQuery } from './dto/list-bookings.query';
import { restoreStock } from './stock';

const BOOKING_INCLUDE = {
  product: {
    select: {
      id: true,
      name: true,
      category: true,
      status: true,
      farmer: {
        select: { farmName: true, region: true, district: true, user: { select: { fullName: true, phone: true } } },
      },
    },
  },
  market: {
    select: { companyName: true, region: true, district: true, user: { select: { fullName: true, phone: true } } },
  },
  payment: { select: { id: true, status: true, amount: true, currency: true, provider: true } },
} satisfies Prisma.BookingInclude;

type BookingRow = Prisma.BookingGetPayload<{ include: typeof BOOKING_INCLUDE }>;

@Injectable()
export class BookingService {
  constructor(private readonly prisma: PrismaService, private readonly notify: NotificationService) {}

  /** Supermarket e'londan kerakli miqdorni bron qiladi; e'lon qoldig'i darhol kamayadi. */
  async create(marketId: string, dto: CreateBookingDto) {
    const qty = new Prisma.Decimal(dto.quantityKg);

    const booking = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: dto.productId, status: ProductStatus.ACTIVE },
      });
      if (!product) throw new NotFoundException("E'lon topilmadi yoki hozir faol emas");

      // Shartli atomik kamaytirish: ikki supermarket bir vaqtda bron qilsa ham qoldiq manfiy bo'lmaydi
      const reserved = await tx.product.updateMany({
        where: { id: product.id, status: ProductStatus.ACTIVE, quantityKg: { gte: qty } },
        data: { quantityKg: { decrement: qty } },
      });
      if (reserved.count === 0) {
        const fresh = await tx.product.findUnique({ where: { id: product.id }, select: { quantityKg: true, status: true } });
        if (!fresh || fresh.status !== ProductStatus.ACTIVE) throw new NotFoundException("E'lon topilmadi yoki hozir faol emas");
        throw new ConflictException(`Yetarli miqdor yo'q. Mavjud: ${fresh.quantityKg} kg`);
      }

      // Qoldiq tugasa, e'lon bozordan chiqadi (BOOKED)
      await tx.product.updateMany({
        where: { id: product.id, quantityKg: { lte: 0 } },
        data: { status: ProductStatus.BOOKED },
      });

      return tx.booking.create({
        data: {
          productId: product.id,
          marketId,
          quantityKg: qty,
          pricePerKg: product.pricePerKg, // narx bron paytida qotiriladi
          message: dto.message?.trim() || null,
          urgent: !!dto.urgent,
        },
        include: BOOKING_INCLUDE,
      });
    });

    this.notify.bookingCreated(booking.id);
    return this.forMarket(booking);
  }

  async listForMarket(marketId: string, query: ListBookingsQuery) {
    const rows = await this.prisma.booking.findMany({
      where: { marketId, ...(query.status && { status: query.status }) },
      orderBy: { createdAt: 'desc' },
      include: BOOKING_INCLUDE,
    });
    return rows.map((b) => this.forMarket(b));
  }

  async listForFarmer(farmerId: string, query: ListBookingsQuery) {
    const rows = await this.prisma.booking.findMany({
      where: { product: { farmerId }, ...(query.status && { status: query.status }) },
      orderBy: { createdAt: 'desc' },
      include: BOOKING_INCLUDE,
    });
    return rows.map((b) => this.forFarmer(b));
  }

  async approve(farmerId: string, id: string) {
    // Tasdiqlangach shu tranzaksiyada yuk tashish buyurtmasi ham yaratiladi
    await this.decide(id, { product: { farmerId } }, BookingStatus.APPROVED, false, async (tx) => {
      await createShipmentForBooking(tx, id);
      await createPaymentForBooking(tx, id); // kutilayotgan (PENDING) escrow to'lovi
    });
    this.notify.bookingApproved(id);
    return this.reload(id, 'farmer');
  }

  async reject(farmerId: string, id: string) {
    await this.decide(id, { product: { farmerId } }, BookingStatus.REJECTED, true);
    return this.reload(id, 'farmer');
  }

  async cancel(marketId: string, id: string) {
    await this.decide(id, { marketId }, BookingStatus.CANCELLED, true);
    return this.reload(id, 'market');
  }

  /** Faqat PENDING holatdagi bronni o'zgartiradi; rad/bekor qilinsa miqdor e'longa qaytadi. */
  private async decide(
    id: string,
    owner: Prisma.BookingWhereInput,
    next: BookingStatus,
    restore: boolean,
    afterUpdate?: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.booking.updateMany({
        where: { id, status: BookingStatus.PENDING, ...owner },
        data: { status: next, decidedAt: new Date() },
      });
      if (changed.count === 0) {
        const exists = await tx.booking.findFirst({ where: { id, ...owner }, select: { status: true } });
        if (!exists) throw new NotFoundException('Bron topilmadi');
        throw new ConflictException("Bu bron allaqachon ko'rib chiqilgan");
      }
      if (afterUpdate) await afterUpdate(tx);
      if (restore) {
        const booking = await tx.booking.findUniqueOrThrow({ where: { id }, select: { productId: true, quantityKg: true } });
        await restoreStock(tx, booking.productId, booking.quantityKg);
      }
    });
  }

  private async reload(id: string, side: 'farmer' | 'market') {
    const row = await this.prisma.booking.findUniqueOrThrow({ where: { id }, include: BOOKING_INCLUDE });
    return side === 'farmer' ? this.forFarmer(row) : this.forMarket(row);
  }

  // ---- Javob shakllari: telefon raqam faqat APPROVED bronda ochiladi ----

  private base(b: BookingRow) {
    return {
      id: b.id,
      status: b.status,
      quantityKg: b.quantityKg,
      pricePerKg: b.pricePerKg,
      totalPrice: b.quantityKg.mul(b.pricePerKg),
      message: b.message,
      createdAt: b.createdAt,
      decidedAt: b.decidedAt,
      product: { id: b.product.id, name: b.product.name, category: b.product.category, status: b.product.status },
      payment: b.payment,
    };
  }

  /** Supermarket ko'radi: fermer ma'lumoti (tasdiqlangach telefon bilan). */
  private forMarket(b: BookingRow) {
    const f = b.product.farmer;
    return {
      ...this.base(b),
      farmer: {
        farmName: f.farmName,
        fullName: f.user.fullName,
        region: f.region,
        district: f.district,
        phone: b.status === BookingStatus.APPROVED ? f.user.phone : null,
      },
    };
  }

  /** Fermer ko'radi: xaridor ma'lumoti (tasdiqlangach telefon bilan). */
  private forFarmer(b: BookingRow) {
    return {
      ...this.base(b),
      market: {
        companyName: b.market.companyName,
        fullName: b.market.user.fullName,
        region: b.market.region,
        district: b.market.district,
        phone: b.status === BookingStatus.APPROVED ? b.market.user.phone : null,
      },
    };
  }
}
