import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OfferStatus, Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../telegram/notification.service';
import { BookingService } from './booking.service';
import { CounterOfferDto, CreateOfferDto } from './dto/offer.dto';

/** Taklif narxi e'lon narxining shu ulushidan past bo'lmasin (xato/axlat takliflardan himoya) */
export const MIN_OFFER_RATIO = 0.3;
/** Bitta market bitta e'longa bir vaqtda ko'pi bilan shuncha ochiq (PENDING/COUNTERED) taklif bera oladi */
export const MAX_OPEN_OFFERS_PER_PRODUCT = 1;
const OPEN: OfferStatus[] = [OfferStatus.PENDING, OfferStatus.COUNTERED];

const INCLUDE = {
  product: { select: { id: true, name: true, category: true, status: true, pricePerKg: true, quantityKg: true, photos: true, deliveryPayer: true, farmer: { select: { farmName: true, region: true, district: true } } } },
  market: { select: { companyName: true, region: true, district: true } },
} satisfies Prisma.PriceOfferInclude;
type OfferRow = Prisma.PriceOfferGetPayload<{ include: typeof INCLUDE }>;

@Injectable()
export class OfferService {
  constructor(private readonly prisma: PrismaService, private readonly bookings: BookingService, private readonly notify: NotificationService) {}

  private view(o: OfferRow, side: 'market' | 'farmer') {
    const effective = o.status === OfferStatus.COUNTERED || (o.status === OfferStatus.ACCEPTED && o.counterPricePerKg)
      ? { pricePerKg: o.counterPricePerKg ?? o.pricePerKg, quantityKg: o.counterQuantityKg ?? o.quantityKg } : { pricePerKg: o.pricePerKg, quantityKg: o.quantityKg };
    return {
      id: o.id, status: o.status, createdAt: o.createdAt, decidedAt: o.decidedAt, bookingId: o.bookingId,
      quantityKg: o.quantityKg, pricePerKg: o.pricePerKg, message: o.message,
      totalPrice: o.quantityKg.mul(o.pricePerKg),
      counter: o.counterPricePerKg ? { pricePerKg: o.counterPricePerKg, quantityKg: o.counterQuantityKg ?? o.quantityKg, message: o.counterMessage, totalPrice: (o.counterQuantityKg ?? o.quantityKg).mul(o.counterPricePerKg) } : null,
      agreed: effective,
      product: { id: o.product.id, name: o.product.name, category: o.product.category, status: o.product.status, pricePerKg: o.product.pricePerKg, availableKg: o.product.quantityKg, photos: o.product.photos, deliveryPayer: o.product.deliveryPayer },
      ...(side === 'farmer' ? { market: { companyName: o.market.companyName, region: o.market.region, district: o.market.district } } : { farmer: o.product.farmer }),
    };
  }

  private async reload(id: string, side: 'market' | 'farmer') {
    return this.view(await this.prisma.priceOffer.findUniqueOrThrow({ where: { id }, include: INCLUDE }), side);
  }

  /** Market: "O'z taklifimni berish" — e'londagi narxdan past narx va miqdor taklif qiladi (zaxira bu paytda band qilinmaydi) */
  async create(marketId: string, dto: CreateOfferDto) {
    const product = await this.prisma.product.findFirst({ where: { id: dto.productId, status: ProductStatus.ACTIVE } });
    if (!product) throw new NotFoundException("E'lon topilmadi yoki hozir faol emas");
    if (new Prisma.Decimal(dto.quantityKg).gt(product.quantityKg)) throw new ConflictException(`Yetarli miqdor yo'q. Mavjud: ${product.quantityKg} kg`);
    if (new Prisma.Decimal(dto.pricePerKg).gt(product.pricePerKg)) throw new BadRequestException("Taklif narxi e'lon narxidan oshmasligi kerak: shu narxda to'g'ridan-to'g'ri bron qiling");
    if (new Prisma.Decimal(dto.pricePerKg).lt(product.pricePerKg.mul(MIN_OFFER_RATIO))) throw new BadRequestException(`Taklif narxi e'lon narxining kamida ${Math.round(MIN_OFFER_RATIO * 100)}% bo'lishi kerak`);
    const open = await this.prisma.priceOffer.count({ where: { productId: product.id, marketId, status: { in: OPEN } } });
    if (open >= MAX_OPEN_OFFERS_PER_PRODUCT) throw new ConflictException("Bu e'lon bo'yicha javob kutilayotgan taklifingiz bor. Avval uni bekor qiling yoki javobni kuting");
    const o = await this.prisma.priceOffer.create({ data: { productId: product.id, marketId, quantityKg: dto.quantityKg, pricePerKg: dto.pricePerKg, message: dto.message?.trim() || null }, include: INCLUDE });
    this.notify.priceOffer(o.id, 'CREATED');
    return this.view(o, 'market');
  }

  async listForMarket(marketId: string) {
    return (await this.prisma.priceOffer.findMany({ where: { marketId }, orderBy: { createdAt: 'desc' }, take: 100, include: INCLUDE })).map((o) => this.view(o, 'market'));
  }

  /** Fermer: "Kutishdagi takliflar" va tarix */
  async listForFarmer(farmerId: string) {
    return (await this.prisma.priceOffer.findMany({ where: { product: { farmerId } }, orderBy: { createdAt: 'desc' }, take: 100, include: INCLUDE })).map((o) => this.view(o, 'farmer'));
  }

  private async owned(where: Prisma.PriceOfferWhereInput, id: string, status: OfferStatus[]) {
    const o = await this.prisma.priceOffer.findFirst({ where: { id, ...where }, include: INCLUDE });
    if (!o) throw new NotFoundException('Taklif topilmadi');
    if (!status.includes(o.status)) throw new ConflictException("Bu taklif allaqachon ko'rib chiqilgan yoki bekor qilingan");
    return o;
  }

  /** Fermer qabul qiladi: bron darhol tasdiqlanadi (kelishilgan narxda), yuk tashish va escrow to'lovi yaratiladi */
  async farmerAccept(farmerId: string, id: string) {
    const o = await this.owned({ product: { farmerId } }, id, [OfferStatus.PENDING]);
    await this.bookings.createFromOffer(o.id, { productId: o.productId, marketId: o.marketId, quantityKg: o.quantityKg, pricePerKg: o.pricePerKg, message: o.message }, [OfferStatus.PENDING]);
    this.notify.priceOffer(id, 'ACCEPTED');
    return this.reload(id, 'farmer');
  }

  async farmerReject(farmerId: string, id: string) {
    await this.owned({ product: { farmerId } }, id, [OfferStatus.PENDING]);
    await this.finish(id, OfferStatus.REJECTED, [OfferStatus.PENDING]);
    this.notify.priceOffer(id, 'REJECTED');
    return this.reload(id, 'farmer');
  }

  /** Fermer: qarshi taklif (narx taklif narxidan baland, e'lon narxidan oshmaydi; miqdor ixtiyoriy) */
  async farmerCounter(farmerId: string, id: string, dto: CounterOfferDto) {
    const o = await this.owned({ product: { farmerId } }, id, [OfferStatus.PENDING]);
    const price = new Prisma.Decimal(dto.pricePerKg), qty = new Prisma.Decimal(dto.quantityKg ?? o.quantityKg);
    if (price.lte(o.pricePerKg)) throw new BadRequestException("Qarshi taklif narxi market taklifidan baland bo'lishi kerak");
    if (price.gt(o.product.pricePerKg)) throw new BadRequestException("Qarshi taklif narxi e'lon narxidan oshmasligi kerak");
    if (qty.gt(o.product.quantityKg)) throw new ConflictException(`Yetarli miqdor yo'q. Mavjud: ${o.product.quantityKg} kg`);
    const moved = await this.prisma.priceOffer.updateMany({
      where: { id, status: OfferStatus.PENDING },
      data: { status: OfferStatus.COUNTERED, counterPricePerKg: price, counterQuantityKg: qty, counterMessage: dto.message?.trim() || null },
    });
    if (moved.count === 0) throw new ConflictException("Bu taklif allaqachon ko'rib chiqilgan");
    this.notify.priceOffer(id, 'COUNTERED');
    return this.reload(id, 'farmer');
  }

  /** Market: fermerning qarshi taklifini qabul qiladi -> bron kelishilgan narx/miqdorda yaratiladi */
  async marketAcceptCounter(marketId: string, id: string) {
    const o = await this.owned({ marketId }, id, [OfferStatus.COUNTERED]);
    await this.bookings.createFromOffer(o.id, { productId: o.productId, marketId: o.marketId, quantityKg: o.counterQuantityKg ?? o.quantityKg, pricePerKg: o.counterPricePerKg ?? o.pricePerKg, message: o.message }, [OfferStatus.COUNTERED]);
    this.notify.priceOffer(id, 'ACCEPTED');
    return this.reload(id, 'market');
  }

  /** Market: taklifini bekor qiladi yoki qarshi taklifni rad etadi */
  async marketCancel(marketId: string, id: string) {
    await this.owned({ marketId }, id, OPEN);
    await this.finish(id, OfferStatus.CANCELLED, OPEN);
    this.notify.priceOffer(id, 'CANCELLED');
    return this.reload(id, 'market');
  }

  private async finish(id: string, status: OfferStatus, from: OfferStatus[]) {
    const moved = await this.prisma.priceOffer.updateMany({ where: { id, status: { in: from } }, data: { status, decidedAt: new Date() } });
    if (moved.count === 0) throw new ConflictException("Bu taklif allaqachon ko'rib chiqilgan");
  }
}
