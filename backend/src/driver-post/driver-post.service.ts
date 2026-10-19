import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DriverExtra, DriverPost, Prisma, Role } from '@prisma/client';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { UPLOADS_DIR, detectImageExt } from '../profile/profile.service';
import { TrustService } from '../trust/trust.service';
import { CreateDriverPostDto, ListDriverPostsQuery, UpdateDriverPostDto } from './dto/driver-post.dto';

export const DRIVER_POST_DIR = join(UPLOADS_DIR, 'driver-posts');
export const MAX_POST_PHOTO_BYTES = 4 * 1024 * 1024;
export const MAX_POST_PHOTOS = 6;
export const MAX_ACTIVE_POSTS = 3;
const URL_PREFIX = '/uploads/driver-posts/';

type PostRow = Prisma.DriverPostGetPayload<{ include: { driver: { include: { user: true } } } }>;

/** +998901234567 -> +998 90 *** ** 67 */
export function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('998')) return `+998 ${d.slice(3, 5)} *** ** ${d.slice(10)}`;
  return d.length > 4 ? `${'*'.repeat(d.length - 2)}${d.slice(-2)}` : '***';
}

const include = { driver: { include: { user: true } } } satisfies Prisma.DriverPostInclude;

@Injectable()
export class DriverPostService {
  constructor(private readonly prisma: PrismaService, private readonly trust: TrustService) {}

  private async present(rows: PostRow[]) {
    const trust = await this.trust.summaries(rows.map((r) => r.driver.userId));
    return rows.map((r) => {
      const u = r.driver.user, t = trust.get(u.id);
      return {
        id: r.id, status: r.status, trailerType: r.trailerType, capacityKg: r.capacityKg, routes: r.routes, workHours: r.workHours,
        currentLocation: r.currentLocation, pickupEtaMinutes: r.pickupEtaMinutes, pricePerKm: r.pricePerKm, priceNote: r.priceNote,
        extras: r.extras, description: r.description, photos: r.photos, deliveryEtaAt: r.deliveryEtaAt, returnPickupAt: r.returnPickupAt,
        wantsBackhaul: r.wantsBackhaul, isActive: r.isActive, createdAt: r.createdAt, vehicleType: r.driver.vehicleType, region: r.driver.region,
        driver: {
          id: r.driverId, userId: u.id, fullName: u.fullName, avatarUrl: u.avatarUrl, phoneMasked: maskPhone(u.phone),
          verified: t?.verified ?? u.isVerified, status: t?.status ?? 'NEW', rank: t?.rank ?? null, topBadges: t?.topBadges ?? [],
          rating: t?.rating ?? { avg: 0, count: 0 }, deals: t?.deals ?? 0, unlocked: t?.unlocked ?? 0, total: t?.total ?? 0,
        },
      };
    });
  }

  async list(query: ListDriverPostsQuery) {
    const where: Prisma.DriverPostWhereInput = { isActive: true };
    if (query.status) where.status = query.status;
    if (query.trailerType) where.trailerType = query.trailerType;
    const extras = (query.extras ?? '').split(',').map((x) => x.trim()).filter((x): x is DriverExtra => x in DriverExtra);
    if (extras.length) where.extras = { hasEvery: extras };
    const and: Prisma.DriverPostWhereInput[] = [];
    const region = (query.region ?? '').trim();
    if (region) and.push({ OR: [{ currentLocation: { contains: region, mode: 'insensitive' } }, { routes: { hasSome: [region] } }, { driver: { region: { contains: region, mode: 'insensitive' } } }] });
    const q = (query.q ?? '').trim();
    if (q) and.push({ OR: [
      { currentLocation: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } },
      { driver: { user: { fullName: { contains: q, mode: 'insensitive' } } } }, { driver: { vehicleType: { contains: q, mode: 'insensitive' } } },
      { driver: { region: { contains: q, mode: 'insensitive' } } },
    ] });
    if (and.length) where.AND = and;
    let rows = await this.prisma.driverPost.findMany({ where, include, orderBy: { createdAt: 'desc' }, take: 200 });
    // Yo'nalish qidiruvi: "samarqand" ham "Samarqand ↔ Toshkent" ni topsin
    if (q || region) {
      const needle = (q || region).toLowerCase();
      const extra = await this.prisma.driverPost.findMany({ where: { ...where, AND: undefined, routes: { isEmpty: false } }, include, take: 400, orderBy: { createdAt: 'desc' } });
      const seen = new Set(rows.map((r) => r.id));
      for (const r of extra) if (!seen.has(r.id) && r.routes.some((x) => x.toLowerCase().includes(needle))) rows.push(r);
      rows = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 200);
    }
    return this.present(rows);
  }

  async mine(driverId: string) {
    const rows = await this.prisma.driverPost.findMany({ where: { driverId }, include, orderBy: { createdAt: 'desc' } });
    return this.present(rows);
  }

  private rules(dto: Partial<CreateDriverPostDto>, merged: Pick<DriverPost, 'status'>) {
    if (dto.deliveryEtaAt && dto.returnPickupAt && dto.returnPickupAt < dto.deliveryEtaAt) throw new BadRequestException("Qaytish yukini olish vaqti yetkazish vaqtidan oldin bo'lmasligi kerak");
    void merged;
  }

  async create(driverId: string, dto: CreateDriverPostDto) {
    const active = await this.prisma.driverPost.count({ where: { driverId, isActive: true } });
    if (active >= MAX_ACTIVE_POSTS) throw new BadRequestException(`Bir vaqtda ${MAX_ACTIVE_POSTS} tadan ortiq faol e'lon bo'lishi mumkin emas`);
    if (!dto.routes.length) throw new BadRequestException("Kamida bitta yo'nalish kiriting");
    this.rules(dto, dto);
    const onRoute = dto.status === 'ON_ROUTE';
    const row = await this.prisma.driverPost.create({
      data: {
        driverId, status: dto.status, trailerType: dto.trailerType, capacityKg: dto.capacityKg, routes: dto.routes, workHours: dto.workHours || null,
        currentLocation: dto.currentLocation, pickupEtaMinutes: dto.pickupEtaMinutes ?? null, pricePerKm: dto.pricePerKm ?? null, priceNote: dto.priceNote || null,
        extras: dto.extras ?? [], description: dto.description || null,
        deliveryEtaAt: onRoute ? dto.deliveryEtaAt ?? null : null, returnPickupAt: onRoute ? dto.returnPickupAt ?? null : null,
        wantsBackhaul: onRoute ? dto.wantsBackhaul ?? true : false, isActive: dto.isActive ?? true,
      },
      include,
    });
    return (await this.present([row]))[0];
  }

  private async owned(id: string, driverId: string | null) {
    const p = await this.prisma.driverPost.findUnique({ where: { id } });
    if (!p) throw new NotFoundException("E'lon topilmadi");
    if (driverId !== null && p.driverId !== driverId) throw new ForbiddenException("Bu e'lon sizga tegishli emas");
    return p;
  }

  async update(id: string, driverId: string | null, dto: UpdateDriverPostDto) {
    const cur = await this.owned(id, driverId);
    if (dto.routes && !dto.routes.length) throw new BadRequestException("Kamida bitta yo'nalish kiriting");
    if (dto.isActive === true && !cur.isActive) {
      const active = await this.prisma.driverPost.count({ where: { driverId: cur.driverId, isActive: true } });
      if (active >= MAX_ACTIVE_POSTS) throw new BadRequestException(`Bir vaqtda ${MAX_ACTIVE_POSTS} tadan ortiq faol e'lon bo'lishi mumkin emas`);
    }
    const status = dto.status ?? cur.status;
    const eta = dto.deliveryEtaAt ?? cur.deliveryEtaAt ?? undefined, ret = dto.returnPickupAt ?? cur.returnPickupAt ?? undefined;
    this.rules({ deliveryEtaAt: eta, returnPickupAt: ret }, { status });
    const data: Prisma.DriverPostUpdateInput = { ...dto, workHours: dto.workHours === undefined ? undefined : dto.workHours || null, priceNote: dto.priceNote === undefined ? undefined : dto.priceNote || null, description: dto.description === undefined ? undefined : dto.description || null };
    if (status === 'AVAILABLE') Object.assign(data, { deliveryEtaAt: null, returnPickupAt: null, wantsBackhaul: false });
    const row = await this.prisma.driverPost.update({ where: { id }, data, include });
    return (await this.present([row]))[0];
  }

  async remove(id: string, driverId: string | null) {
    const cur = await this.owned(id, driverId);
    await this.prisma.driverPost.delete({ where: { id } });
    await Promise.all(cur.photos.map((u) => this.removeFile(u)));
    return { ok: true };
  }

  async addPhoto(id: string, driverId: string, file: Express.Multer.File | undefined) {
    const cur = await this.owned(id, driverId);
    if (!file) throw new BadRequestException('Rasm faylini yuboring (file maydoni)');
    if (cur.photos.length >= MAX_POST_PHOTOS) throw new BadRequestException(`Ko'pi bilan ${MAX_POST_PHOTOS} ta rasm yuklash mumkin`);
    const ext = detectImageExt(file.buffer);
    if (!ext) throw new BadRequestException('Faqat JPG, PNG yoki WEBP rasm yuklash mumkin');
    await fs.mkdir(DRIVER_POST_DIR, { recursive: true });
    const name = `${randomBytes(12).toString('hex')}.${ext}`;
    await fs.writeFile(join(DRIVER_POST_DIR, name), file.buffer);
    const row = await this.prisma.driverPost.update({ where: { id }, data: { photos: { push: `${URL_PREFIX}${name}` } }, include });
    return (await this.present([row]))[0];
  }

  async removePhoto(id: string, driverId: string, index: number) {
    const cur = await this.owned(id, driverId);
    const url = cur.photos[index];
    if (!url) throw new NotFoundException('Rasm topilmadi');
    const row = await this.prisma.driverPost.update({ where: { id }, data: { photos: cur.photos.filter((_, i) => i !== index) }, include });
    await this.removeFile(url);
    return (await this.present([row]))[0];
  }

  /** Telefon raqami faqat yuk egalari va xodimlarga ochiladi */
  async contact(id: string, role: Role) {
    const p = await this.prisma.driverPost.findUnique({ where: { id }, include });
    if (!p || !p.isActive) throw new NotFoundException("E'lon topilmadi");
    return { phone: p.driver.user.phone, fullName: p.driver.user.fullName };
  }

  private async removeFile(url: string) {
    if (!url.startsWith(URL_PREFIX)) return;
    const name = url.slice(URL_PREFIX.length);
    if (name.includes('/') || name.includes('..')) return;
    await fs.rm(join(DRIVER_POST_DIR, name), { force: true });
  }
}
