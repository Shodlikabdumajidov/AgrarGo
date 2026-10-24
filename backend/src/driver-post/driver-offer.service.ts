import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus, Prisma, Role, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../telegram/notification.service';
import { CreateOfferDto } from './dto/driver-post.dto';

const MAX_OFFERS_PER_DAY = 20;

const SHIPMENT_SEL = {
  id: true, cargoName: true, category: true, weightKg: true, originRegion: true, originDistrict: true, destRegion: true, destDistrict: true, status: true, driverId: true,
  booking: { select: { payment: { select: { status: true, deliveryFee: true, distanceKm: true } } } },
  warehouseOrder: { select: { payment: { select: { status: true, deliveryFee: true, distanceKm: true } } } },
} satisfies Prisma.ShipmentSelect;
type ShipmentRow = Prisma.ShipmentGetPayload<{ select: typeof SHIPMENT_SEL }>;

/** Yuk taklifi: fermer/market o'z ochiq yukini haydovchi e' loniga yuboradi (haydovchi kabinetida va Telegramda ko'rinadi) */
@Injectable()
export class DriverOfferService {
  constructor(private readonly prisma: PrismaService, private readonly notify: NotificationService) {}

  private brief(s: ShipmentRow) {
    const pay = s.booking?.payment ?? s.warehouseOrder?.payment ?? null;
    return {
      id: s.id, cargoName: s.cargoName, category: s.category, weightKg: Number(s.weightKg),
      origin: { region: s.originRegion, district: s.originDistrict }, destination: { region: s.destRegion, district: s.destDistrict },
      price: pay ? Number(pay.deliveryFee) : 0, distanceKm: pay?.distanceKm ?? 0, ready: pay?.status === PaymentStatus.HELD,
    };
  }

  private ownerWhere(user: { role: Role; farmer?: { id: string } | null; market?: { id: string } | null }): Prisma.ShipmentWhereInput {
    if (user.role === Role.FARMER && user.farmer) return { farmerId: user.farmer.id };
    if (user.role === Role.MARKET && user.market) return { marketId: user.market.id };
    throw new ForbiddenException('Yuk taklif qilish faqat fermer va market uchun');
  }

  /** Taklif qilish mumkin bo'lgan o'z yuklari (haydovchisiz, ochiq). postId berilsa — sig'adimi belgisi bilan */
  async offerable(user: any, postId?: string) {
    const post = postId ? await this.prisma.driverPost.findUnique({ where: { id: postId } }) : null;
    const rows = await this.prisma.shipment.findMany({ where: { ...this.ownerWhere(user), status: ShipmentStatus.OPEN, driverId: null }, orderBy: { createdAt: 'desc' }, take: 50, select: SHIPMENT_SEL });
    const sent = post ? new Set((await this.prisma.driverOffer.findMany({ where: { postId: post.id, fromUserId: user.id }, select: { shipmentId: true } })).map((o) => o.shipmentId)) : new Set<string>();
    const room = post ? (post.loadMode === 'LTL' ? post.availableCapacityKg : post.capacityKg) : null;
    return rows.map((r) => ({ ...this.brief(r), ...(room !== null && { fits: Number(r.weightKg) <= room }), alreadyOffered: sent.has(r.id) }));
  }

  async create(user: any, postId: string, dto: CreateOfferDto) {
    const post = await this.prisma.driverPost.findUnique({ where: { id: postId }, include: { driver: { select: { userId: true } } } });
    if (!post || !post.isActive) throw new NotFoundException("E'lon topilmadi");
    const s = await this.prisma.shipment.findFirst({ where: { id: dto.shipmentId, ...this.ownerWhere(user) }, select: SHIPMENT_SEL });
    if (!s) throw new NotFoundException('Yuk topilmadi yoki u sizga tegishli emas');
    if (s.status !== ShipmentStatus.OPEN || s.driverId) throw new ConflictException('Bu yukka allaqachon haydovchi biriktirilgan');
    const room = post.loadMode === 'LTL' ? post.availableCapacityKg : post.capacityKg;
    if (Number(s.weightKg) > room) throw new ConflictException(`Yuk og'irligi (${Number(s.weightKg)} kg) haydovchining bo'sh joyidan (${room} kg) ko'p`);
    if (dto.pickupAt && dto.pickupAt.getTime() < Date.now() - 60_000) throw new ConflictException("Yuk olinadigan vaqt o'tib ketgan bo'lmasligi kerak");
    const today = await this.prisma.driverOffer.count({ where: { fromUserId: user.id, createdAt: { gte: new Date(Date.now() - 86_400_000) } } });
    if (today >= MAX_OFFERS_PER_DAY) throw new ConflictException("Bir kunda juda ko'p taklif yubordingiz. Keyinroq urinib ko'ring");
    try {
      const o = await this.prisma.driverOffer.create({ data: { postId, shipmentId: s.id, fromUserId: user.id, pickupAt: dto.pickupAt ?? null, note: dto.note || null } });
      this.notify.driverOffer(o.id);
      return { id: o.id, shipment: this.brief(s), pickupAt: o.pickupAt, note: o.note, createdAt: o.createdAt };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Bu yuk shu haydovchiga allaqachon taklif qilingan');
      throw e;
    }
  }

  /** Haydovchining kelgan takliflari (o'z e'lonlari bo'yicha) */
  async mine(driverId: string) {
    const rows = await this.prisma.driverOffer.findMany({
      where: { post: { driverId } }, orderBy: { createdAt: 'desc' }, take: 50,
      include: {
        post: { select: { id: true, routes: true, trailerType: true } },
        shipment: { select: SHIPMENT_SEL },
        fromUser: { select: { fullName: true, role: true, farmer: { select: { farmName: true } }, market: { select: { companyName: true } } } },
      },
    });
    return rows.map((o) => ({
      id: o.id, createdAt: o.createdAt, readAt: o.readAt, pickupAt: o.pickupAt, note: o.note,
      post: { id: o.post.id, route: o.post.routes[0] ?? null, trailerType: o.post.trailerType },
      from: { role: o.fromUser.role, name: o.fromUser.farmer?.farmName ?? o.fromUser.market?.companyName ?? o.fromUser.fullName },
      shipment: this.brief(o.shipment), open: o.shipment.status === ShipmentStatus.OPEN && !o.shipment.driverId,
    }));
  }

  async markRead(driverId: string, id: string) {
    const r = await this.prisma.driverOffer.updateMany({ where: { id, post: { driverId }, readAt: null }, data: { readAt: new Date() } });
    if (r.count === 0 && !(await this.prisma.driverOffer.findFirst({ where: { id, post: { driverId } }, select: { id: true } }))) throw new NotFoundException('Taklif topilmadi');
    return { ok: true };
  }
}
