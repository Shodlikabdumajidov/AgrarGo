import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BidStatus, PaymentStatus, Prisma, Role, ShipmentStatus } from '@prisma/client';
import { PaymentService } from '../payment/payment.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShipmentService } from './shipment.service';

/** Haydovchi taklifi escrow'dagi yo'l haqining kamida shuncha qismi bo'lishi kerak (tavsiya oralig'i quyi chegarasi: -30% gacha) */
export const BID_MIN_RATIO = 0.7;

export interface BidViewer { role: Role; driverId?: string; farmerId?: string; marketId?: string }

@Injectable()
export class BidService {
  constructor(private readonly prisma: PrismaService, private readonly payments: PaymentService, private readonly shipments: ShipmentService) {}

  private async openShipment(id: string) {
    const s = await this.prisma.shipment.findUnique({
      where: { id },
      select: { id: true, status: true, driverId: true, farmerId: true, marketId: true, weightKg: true, bookingId: true, warehouseOrderId: true, booking: { select: { payment: true } }, warehouseOrder: { select: { payment: true } } },
    });
    if (!s) throw new NotFoundException('Yuk topilmadi');
    return { ...s, payment: s.booking?.payment ?? s.warehouseOrder?.payment ?? null };
  }

  /** Haydovchi o'z narxini taklif qiladi (counter-offer). Oralig'i: [escrow yo'l haqining 70%, 100%] */
  async place(viewer: BidViewer, shipmentId: string, price: number, note?: string) {
    if (viewer.role !== Role.DRIVER || !viewer.driverId) throw new ForbiddenException('Narx taklif qilish faqat haydovchilar uchun');
    const s = await this.openShipment(shipmentId);
    if (s.status !== ShipmentStatus.OPEN || s.driverId) throw new ConflictException('Bu yuk allaqachon boshqa haydovchiga biriktirilgan');
    if (s.payment?.status !== PaymentStatus.HELD) throw new ConflictException("Xaridor to'lovi hali kafolatlanmagan: narx taklif qilib bo'lmaydi");
    const driver = await this.prisma.driver.findUniqueOrThrow({ where: { id: viewer.driverId }, select: { capacityKg: true } });
    if (s.weightKg.gt(driver.capacityKg)) throw new ConflictException("Yuk og'irligi transportingiz sig'imidan ko'p");
    const fee = s.payment.deliveryFee;
    const min = fee.mul(BID_MIN_RATIO).div(1000).ceil().mul(1000);
    const p = new Prisma.Decimal(price);
    if (p.gt(fee) || p.lt(min)) throw new BadRequestException(`Taklif ${min.toFixed(0)} dan ${fee.toFixed(0)} so'mgacha bo'lishi kerak (escrow'dagi yo'l haqi: ${fee.toFixed(0)} so'm)`);
    const bid = await this.prisma.shipmentBid.upsert({
      where: { shipmentId_driverId: { shipmentId, driverId: viewer.driverId } },
      create: { shipmentId, driverId: viewer.driverId, price: p, note: note?.trim() || null },
      update: { price: p, note: note?.trim() || null, status: BidStatus.PENDING, decidedAt: null },
    });
    return this.present(bid);
  }

  /** Egalar (fermer/market) va dispetcher barcha takliflarni ko'radi (arzonidan boshlab); haydovchi faqat o'zinikini */
  async list(viewer: BidViewer, shipmentId: string) {
    const s = await this.openShipment(shipmentId);
    const staff = viewer.role === Role.DISPATCHER || viewer.role === Role.ADMIN;
    const owner = (viewer.role === Role.FARMER && viewer.farmerId === s.farmerId) || (viewer.role === Role.MARKET && viewer.marketId === s.marketId);
    const driver = viewer.role === Role.DRIVER && !!viewer.driverId;
    if (!staff && !owner && !driver) throw new ForbiddenException("Bu yuk takliflariga kirish huquqingiz yo'q");
    const rows = await this.prisma.shipmentBid.findMany({
      where: { shipmentId, ...(driver && { driverId: viewer.driverId }) },
      orderBy: [{ price: 'asc' }, { createdAt: 'asc' }],
      include: { driver: { select: { vehicleType: true, plateNumber: true, capacityKg: true, user: { select: { fullName: true, penaltyPoints: true } } } } },
    });
    return {
      escrowDeliveryFee: s.payment ? Number(s.payment.deliveryFee) : null,
      bids: rows.map((b) => ({
        ...this.present(b),
        driver: driver ? undefined : { fullName: b.driver.user.fullName, vehicleType: b.driver.vehicleType, plateNumber: b.driver.plateNumber, capacityKg: Number(b.driver.capacityKg), penaltyPoints: b.driver.user.penaltyPoints },
      })),
    };
  }

  /**
   * Taklifni qabul qilish (yuk egasi yoki dispetcher): haydovchi biriktiriladi, yo'l haqi taklif narxiga tushadi,
   * farq xaridorga qaytadi (yetkazish fermer hisobidan bo'lsa fermer sof summasiga qo'shiladi). Hammasi bitta tranzaksiyada.
   */
  async accept(viewer: BidViewer, shipmentId: string, bidId: string, acknowledgeRisk?: boolean) {
    const s = await this.openShipment(shipmentId);
    const staff = viewer.role === Role.DISPATCHER || viewer.role === Role.ADMIN;
    const owner = (viewer.role === Role.FARMER && viewer.farmerId === s.farmerId) || (viewer.role === Role.MARKET && viewer.marketId === s.marketId);
    if (!staff && !owner) throw new ForbiddenException("Taklifni faqat yuk egasi yoki dispetcher qabul qiladi");
    await this.prisma.$transaction(async (tx) => {
      const bid = await tx.shipmentBid.findUnique({ where: { id: bidId } });
      if (!bid || bid.shipmentId !== shipmentId) throw new NotFoundException('Taklif topilmadi');
      const claimed = await tx.shipmentBid.updateMany({ where: { id: bidId, status: BidStatus.PENDING }, data: { status: BidStatus.ACCEPTED, decidedAt: new Date() } });
      if (claimed.count === 0) throw new ConflictException('Bu taklif allaqachon ko\'rib chiqilgan');
      await this.shipments.assignInTx(tx, bid.driverId, shipmentId, acknowledgeRisk);
      if (s.payment) await this.payments.reduceDeliveryFee(tx, s.payment.id, bid.price, viewer.role);
      await tx.shipment.update({ where: { id: shipmentId }, data: { agreedDeliveryFee: bid.price } });
      await tx.shipmentBid.updateMany({ where: { shipmentId, status: BidStatus.PENDING }, data: { status: BidStatus.REJECTED, decidedAt: new Date() } });
    });
    return this.list(viewer, shipmentId);
  }

  private present(b: { id: string; shipmentId: string; price: Prisma.Decimal; note: string | null; status: BidStatus; createdAt: Date }) {
    return { id: b.id, shipmentId: b.shipmentId, price: Number(b.price), note: b.note, status: b.status, createdAt: b.createdAt };
  }
}
