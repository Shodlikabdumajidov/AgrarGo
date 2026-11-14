import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRatingDto } from './ratings.dto';
import { TrustService } from './trust.service';

@Injectable()
export class RatingsService {
  constructor(private readonly prisma: PrismaService, private readonly trust: TrustService) {}

  /** Yetkazilgan yukdan keyin tomon boshqa tomonni baholaydi: haydovchi <-> fermer/market */
  async create(raterId: string, dto: CreateRatingDto) {
    const s = await this.prisma.shipment.findUnique({
      where: { id: dto.shipmentId },
      select: { status: true, farmer: { select: { userId: true } }, market: { select: { userId: true } }, driver: { select: { userId: true } } },
    });
    if (!s) throw new NotFoundException('Yuk topilmadi');
    const users = { FARMER: s.farmer.userId, MARKET: s.market.userId, DRIVER: s.driver?.userId ?? null };
    const myRole = (Object.keys(users) as (keyof typeof users)[]).find((r) => users[r] === raterId);
    if (!myRole) throw new ForbiddenException("Siz bu yukda ishtirok etmagansiz");
    if (s.status !== ShipmentStatus.DELIVERED) throw new BadRequestException("Faqat yetkazib berilgan yukni baholash mumkin");
    if (dto.targetRole === myRole) throw new BadRequestException("O'zingizni baholay olmaysiz");
    const targetId = users[dto.targetRole];
    if (!targetId) throw new BadRequestException("Baholanadigan tomon topilmadi");
    if (dto.targetRole !== 'DRIVER' && (dto.friendly || dto.damaged)) throw new BadRequestException("Bu teglar faqat haydovchiga beriladi");
    try {
      const r = await this.prisma.shipmentRating.create({
        data: { shipmentId: dto.shipmentId, raterId, targetId, stars: dto.stars, friendly: !!dto.friendly, damaged: !!dto.damaged, comment: dto.comment || null },
        select: { id: true, shipmentId: true, stars: true, friendly: true, damaged: true, createdAt: true },
      });
      this.trust.invalidate(targetId);
      return { ...r, targetRole: dto.targetRole };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException("Siz bu yukni allaqachon baholagansiz");
      throw e;
    }
  }

  /** Men bergan baholar: kartochkalarda "Baho berish" tugmasini ko'rsatish yoki yashirish uchun */
  async mine(userId: string) {
    const rows = await this.prisma.shipmentRating.findMany({
      where: { raterId: userId }, orderBy: { createdAt: 'desc' }, take: 500,
      select: { shipmentId: true, stars: true, target: { select: { role: true } } },
    });
    return rows.map((r) => ({ shipmentId: r.shipmentId, targetRole: r.target.role, stars: r.stars }));
  }
}
