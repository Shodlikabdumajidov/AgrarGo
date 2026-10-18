import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './settings.dto';

const FALLBACK = {
  siteName: 'AgrarGo',
  callCenterPhones: ['+998 78 140 09 09'],
  supportEmail: null as string | null,
  telegramHandle: null as string | null,
  telegramUrl: null as string | null,
  instagramUrl: null as string | null,
  facebookUrl: null as string | null,
  youtubeUrl: null as string | null,
  workingHours: { uz: '', ru: '', en: '' },
  address: { uz: '', ru: '', en: '' },
};

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ochiq (tokensiz) ko'rinish: faqat saytda ko'rsatiladigan maydonlar. */
  async getPublic() {
    const row = await this.prisma.systemSettings.findUnique({ where: { id: 1 } });
    if (!row) return { ...FALLBACK, updatedAt: null };
    const { id: _id, updatedById: _by, ...rest } = row;
    return rest;
  }

  async getForAdmin() {
    const row = await this.prisma.systemSettings.findUnique({ where: { id: 1 } });
    return row ?? { id: 1, ...FALLBACK, updatedById: null, updatedAt: null };
  }

  /** Faqat yuborilgan maydonlar o'zgaradi; null yuborilsa maydon tozalanadi. Natija: yangi va oldingi qiymat. */
  async update(actorId: string, dto: UpdateSettingsDto) {
    const before = await this.getForAdmin();
    const fields: Prisma.SystemSettingsUncheckedUpdateInput = { updatedById: actorId };
    for (const k of ['siteName', 'supportEmail', 'telegramUrl', 'instagramUrl', 'facebookUrl', 'youtubeUrl'] as const) {
      if (dto[k] !== undefined) (fields as any)[k] = dto[k];
    }
    if (dto.telegramHandle !== undefined) fields.telegramHandle = dto.telegramHandle ? dto.telegramHandle.replace(/^@?/, '@') : null;
    if (dto.callCenterPhones) fields.callCenterPhones = dto.callCenterPhones.map((p) => p.trim());
    if (dto.workingHours) fields.workingHours = { uz: dto.workingHours.uz, ru: dto.workingHours.ru, en: dto.workingHours.en };
    if (dto.address) fields.address = { uz: dto.address.uz, ru: dto.address.ru, en: dto.address.en };
    const row = await this.prisma.systemSettings.upsert({
      where: { id: 1 },
      update: fields,
      create: { ...FALLBACK, ...(fields as object), id: 1 } as Prisma.SystemSettingsUncheckedCreateInput,
    });
    return { row, before };
  }
}
