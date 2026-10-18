import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { USER_WITH_PROFILES } from '../auth/auth.service';
import { publicUser } from '../common/public-user';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateDriverProfileDto, UpdateFarmerProfileDto, UpdateMarketProfileDto } from './dto/update-profile.dto';

export const UPLOADS_DIR = join(process.cwd(), 'uploads');
const AVATAR_DIR = join(UPLOADS_DIR, 'avatars');
const COVER_DIR = join(UPLOADS_DIR, 'covers');
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const MAX_COVER_BYTES = 4 * 1024 * 1024;
// Muqova faqat fermer va market uchun (ular ommaviy tanishtiruvda ko'rinadi)
const COVER_ROLES: Role[] = [Role.FARMER, Role.MARKET];

// Fayl turi mijoz yuborgan Content-Type'ga emas, haqiqiy baytlarga qarab aniqlanadi
export function detectImageExt(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

async function parseDto<T extends object>(cls: new () => T, body: unknown): Promise<T> {
  const instance = plainToInstance(cls, body ?? {});
  const errors = await validate(instance, { whitelist: true });
  if (errors.length) {
    throw new BadRequestException(errors.flatMap((e) => Object.values(e.constraints ?? {})));
  }
  return instance;
}

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: USER_WITH_PROFILES });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');
    return publicUser(user);
  }

  async update(userId: string, role: Role, body: unknown) {
    const data: Prisma.UserUpdateInput = {};
    const set = <T extends object>(dto: T, keys: (keyof T)[]) =>
      Object.fromEntries(keys.filter((k) => dto[k] !== undefined).map((k) => [k, dto[k]]));

    if (role === Role.FARMER) {
      const dto = await parseDto(UpdateFarmerProfileDto, body);
      if (dto.fullName !== undefined) data.fullName = dto.fullName;
      data.farmer = { update: set(dto, ['farmName', 'region', 'district', 'address', 'latitude', 'longitude', 'stir']) };
    } else if (role === Role.DRIVER) {
      const dto = await parseDto(UpdateDriverProfileDto, body);
      if (dto.fullName !== undefined) data.fullName = dto.fullName;
      if (dto.plateNumber !== undefined) dto.plateNumber = dto.plateNumber.replace(/[\s-]/g, '').toUpperCase();
      data.driver = { update: set(dto, ['vehicleType', 'plateNumber', 'capacityKg', 'region', 'licenseNumber']) };
    } else if (role === Role.MARKET) {
      const dto = await parseDto(UpdateMarketProfileDto, body);
      if (dto.fullName !== undefined) data.fullName = dto.fullName;
      data.market = { update: set(dto, ['companyName', 'region', 'district', 'address', 'stir']) };
    } else {
      throw new BadRequestException("Bu rol uchun profil tahrirlash mavjud emas");
    }

    try {
      await this.prisma.user.update({ where: { id: userId }, data });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const target = String(e.meta?.target ?? '');
        if (target.includes('stir')) throw new ConflictException("Bu STIR allaqachon ro'yxatdan o'tgan");
        if (target.includes('plateNumber')) throw new ConflictException("Bu davlat raqami allaqachon ro'yxatdan o'tgan");
      }
      throw e;
    }
    return this.get(userId);
  }

  async setAvatar(userId: string, file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Rasm faylini yuboring (file maydoni)');
    const ext = detectImageExt(file.buffer);
    if (!ext) throw new BadRequestException("Faqat JPG, PNG yoki WEBP rasm yuklash mumkin");

    await fs.mkdir(AVATAR_DIR, { recursive: true });
    const filename = `${userId}-${randomBytes(6).toString('hex')}.${ext}`;
    await fs.writeFile(join(AVATAR_DIR, filename), file.buffer);

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });
    await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl: `/uploads/avatars/${filename}` } });
    await this.removeFile(user?.avatarUrl);
    return this.get(userId);
  }

  async removeAvatar(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });
    await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl: null } });
    await this.removeFile(user?.avatarUrl);
    return this.get(userId);
  }

  async setCover(userId: string, role: Role, file: Express.Multer.File | undefined) {
    if (!COVER_ROLES.includes(role)) throw new ForbiddenException('Muqova rasmini faqat fermer va market yuklay oladi');
    if (!file) throw new BadRequestException('Rasm faylini yuboring (file maydoni)');
    const ext = detectImageExt(file.buffer);
    if (!ext) throw new BadRequestException('Faqat JPG, PNG yoki WEBP rasm yuklash mumkin');

    await fs.mkdir(COVER_DIR, { recursive: true });
    const filename = `${userId}-${randomBytes(6).toString('hex')}.${ext}`;
    await fs.writeFile(join(COVER_DIR, filename), file.buffer);

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { coverUrl: true } });
    await this.prisma.user.update({ where: { id: userId }, data: { coverUrl: `/uploads/covers/${filename}` } });
    await this.removeFile(user?.coverUrl);
    return this.get(userId);
  }

  async removeCover(userId: string, role: Role) {
    if (!COVER_ROLES.includes(role)) throw new ForbiddenException('Muqova rasmini faqat fermer va market boshqara oladi');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { coverUrl: true } });
    await this.prisma.user.update({ where: { id: userId }, data: { coverUrl: null } });
    await this.removeFile(user?.coverUrl);
    return this.get(userId);
  }

  /** Faqat o'zimiz yaratgan papkalar ichidagi fayl o'chiriladi (yo'l o'zgartirib bo'lmaydi). */
  private async removeFile(url?: string | null) {
    if (!url) return;
    for (const [prefix, dir] of [['/uploads/avatars/', AVATAR_DIR], ['/uploads/covers/', COVER_DIR]] as const) {
      if (!url.startsWith(prefix)) continue;
      const name = url.slice(prefix.length);
      if (name.includes('/') || name.includes('..')) return;
      await fs.rm(join(dir, name), { force: true });
      return;
    }
  }
}
