import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { APP_ENV } from '../config/app-env.module';
import { AppEnv } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { REVIEW_ROLES } from './dto/review.dto';

export const MIN_COMMENT = 10;
export const MAX_COMMENT = 500;

/** Izohni tozalaydi va spamga qarshi tekshiradi (havolalar, takrorlanuvchi belgilar). Xabarlar foydalanuvchiga ko'rsatiladi. */
export function cleanComment(raw: string): string {
  const text = raw
    .normalize('NFC')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '') // boshqaruv va yo'nalish belgilari
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length < MIN_COMMENT) throw new BadRequestException(`Izoh kamida ${MIN_COMMENT} ta belgidan iborat bo'lishi kerak`);
  if (text.length > MAX_COMMENT) throw new BadRequestException(`Izoh ${MAX_COMMENT} ta belgidan oshmasligi kerak`);
  if (/(https?:\/\/|www\.|t\.me\/|@[a-z0-9_]{4,}|\b[a-z0-9-]+\.(com|uz|ru|org|net|info|biz|xyz|top)\b)/i.test(text)) {
    throw new BadRequestException("Izohda havola yoki aloqa manzili bo'lishi mumkin emas");
  }
  if (/(.)\1{9,}/u.test(text) || new Set(text.toLowerCase().replace(/\s/g, '')).size < 5) {
    throw new BadRequestException("Izoh mazmunli matn bo'lishi kerak");
  }
  return text;
}

const maskName = (full: string) => {
  const [first = '', ...rest] = full.trim().split(/\s+/);
  const last = rest[rest.length - 1];
  return last ? `${first} ${last[0].toUpperCase()}.` : first;
};

const PROFILE = {
  user: { select: { fullName: true, farmer: { select: { region: true } }, market: { select: { region: true } }, driver: { select: { region: true } } } },
} satisfies Prisma.ReviewInclude;
type Row = Prisma.ReviewGetPayload<{ include: typeof PROFILE }>;

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService, @Inject(APP_ENV) private readonly env: AppEnv) {}

  /** Ochiq ko'rinish: faqat ism + familiya bosh harfi, rol, viloyat. Telefon, ID va akkaunt ma'lumotlari chiqmaydi. */
  private view(r: Row) {
    return {
      id: r.id,
      name: maskName(r.user.fullName),
      role: r.role,
      region: r.user.farmer?.region ?? r.user.market?.region ?? r.user.driver?.region ?? null,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
    };
  }

  /** Ochiq ro'yxat va umumiy statistika (tokensiz). */
  async list(query: { role?: Role; limit?: number }) {
    const where: Prisma.ReviewWhereInput = { isApproved: true };
    const [rows, grouped] = await Promise.all([
      this.prisma.review.findMany({
        where: { ...where, ...(query.role && { role: query.role }) },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: query.limit ?? 12,
        include: PROFILE,
      }),
      this.prisma.review.groupBy({ by: ['role', 'rating'], where, _count: { _all: true } }),
    ]);
    const round = (n: number) => Math.round(n * 10) / 10;
    const summarize = (roles: readonly Role[]) => {
      const part = grouped.filter((g) => roles.includes(g.role));
      const count = part.reduce((n, g) => n + g._count._all, 0);
      const sum = part.reduce((n, g) => n + g.rating * g._count._all, 0);
      return {
        count,
        average: count ? round(sum / count) : 0,
        distribution: [1, 2, 3, 4, 5].map((r) => ({ rating: r, count: part.filter((g) => g.rating === r).reduce((n, g) => n + g._count._all, 0) })),
      };
    };
    return {
      items: rows.map((r) => this.view(r)),
      // Umumiy ko'rsatkichlar va har bir rol bo'yicha alohida (rol sahifasida shu rolning baholari ko'rsatiladi)
      stats: {
        ...summarize(REVIEW_ROLES),
        byRole: Object.fromEntries(REVIEW_ROLES.map((r) => [r, summarize([r])])),
      },
    };
  }

  async mine(userId: string) {
    const r = await this.prisma.review.findUnique({ where: { userId }, select: { id: true, rating: true, comment: true, isApproved: true, createdAt: true, updatedAt: true } });
    return { review: r };
  }

  /** Bitta foydalanuvchi — bitta sharh: qayta yuborsa yangilanadi. Faqat fermer, haydovchi va market sharh qoldiradi. */
  async upsert(user: { id: string; role: Role }, dto: { rating: number; comment: string }) {
    if (!(REVIEW_ROLES as readonly Role[]).includes(user.role)) throw new ForbiddenException('Sharhni faqat fermer, haydovchi yoki market qoldira oladi');
    const comment = cleanComment(dto.comment);
    // Boshqa foydalanuvchining so'nggi soatdagi aynan shu matnini takrorlash (ommaviy spam) rad etiladi
    const dup = await this.prisma.review.findFirst({ where: { comment, userId: { not: user.id }, createdAt: { gt: new Date(Date.now() - 3600_000) } }, select: { id: true } });
    if (dup) throw new ConflictException("Bunday izoh yaqinda qoldirilgan. O'z fikringizni yozing");

    const isApproved = this.env.REVIEWS_AUTO_APPROVE;
    const row = await this.prisma.review.upsert({
      where: { userId: user.id },
      create: { userId: user.id, role: user.role, rating: dto.rating, comment, isApproved },
      update: { rating: dto.rating, comment, isApproved }, // tahrir qayta ko'rib chiqiladi (moderatsiya yoqilgan bo'lsa)
      include: PROFILE,
    });
    return { ...this.view(row), isApproved: row.isApproved };
  }

  async removeMine(userId: string) {
    await this.prisma.review.deleteMany({ where: { userId } });
    return { ok: true };
  }

  // ---------- Admin ----------

  async adminList(q: { state?: 'approved' | 'hidden'; page?: number; limit?: number }) {
    const page = q.page ?? 1, limit = q.limit ?? 20;
    const where: Prisma.ReviewWhereInput = q.state ? { isApproved: q.state === 'approved' } : {};
    const [items, total] = await Promise.all([
      this.prisma.review.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
        include: { user: { select: { fullName: true, phone: true } } },
      }),
      this.prisma.review.count({ where }),
    ]);
    return {
      items: items.map((r) => ({ id: r.id, role: r.role, rating: r.rating, comment: r.comment, isApproved: r.isApproved, createdAt: r.createdAt, author: { fullName: r.user.fullName, phone: r.user.phone } })),
      total, page, limit,
    };
  }

  async adminSetApproval(id: string, isApproved: boolean) {
    const r = await this.prisma.review.updateMany({ where: { id }, data: { isApproved } });
    if (r.count === 0) throw new NotFoundException('Sharh topilmadi');
    return { id, isApproved };
  }

  async adminDelete(id: string) {
    const r = await this.prisma.review.deleteMany({ where: { id } });
    if (r.count === 0) throw new NotFoundException('Sharh topilmadi');
    return { ok: true };
  }
}
