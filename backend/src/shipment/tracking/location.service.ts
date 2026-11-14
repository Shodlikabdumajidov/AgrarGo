import {
  BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { LocationSource, Prisma, Role, ShipmentStatus } from '@prisma/client';
import { APP_ENV } from '../../config/app-env.module';
import { AppEnv } from '../../config/env.validation';
import { PrismaService } from '../../prisma/prisma.service';
import { SendLocationDto } from '../dto/location.dto';
import { summarizeDays, TASHKENT_OFFSET_MS, DAILY_DRIVING_LIMIT_MIN } from './eld';
import { haversineKm, regionCenter } from './geo';

export const MAX_FUTURE_MS = 30_000; // soat farqi uchun kichik zaxira
export const MAX_AGE_MS = 10 * 60_000; // eski nuqtalar (qayta yuborilgan/soxta) qabul qilinmaydi
export const MAX_PLAUSIBLE_KMH = 200; // yuk mashinasi uchun mumkin bo'lmagan "sakrash" rad etiladi
export const TRAIL_LIMIT = 200;
const ELD_ROW_CAP = 30_000;

@Injectable()
export class LocationService {
  constructor(private readonly prisma: PrismaService, @Inject(APP_ENV) private readonly env: AppEnv) {}

  // ---------- Haydovchi: koordinata yuborish ----------

  async record(driverId: string, shipmentId: string, dto: SendLocationDto) {
    const source = dto.source ?? LocationSource.GPS;
    if (source === LocationSource.SIMULATED && !this.env.LOCATION_ALLOW_SIMULATION) {
      throw new ForbiddenException("Simulyatsiya (demo) rejimi bu serverda o'chirilgan");
    }

    const now = Date.now();
    const recordedAt = dto.timestamp ? new Date(dto.timestamp) : new Date(now);
    if (Number.isNaN(recordedAt.getTime())) throw new BadRequestException("timestamp noto'g'ri");
    if (recordedAt.getTime() > now + MAX_FUTURE_MS) throw new BadRequestException('timestamp kelajakda bo\'lishi mumkin emas');
    if (recordedAt.getTime() < now - MAX_AGE_MS) throw new BadRequestException('timestamp juda eski (10 daqiqadan ortiq)');

    const shipment = await this.prisma.shipment.findFirst({
      where: { id: shipmentId, driverId },
      select: { status: true, lastLat: true, lastLng: true, lastLocationAt: true },
    });
    if (!shipment) throw new NotFoundException('Yuk topilmadi');
    if (shipment.status !== ShipmentStatus.IN_TRANSIT) {
      throw new ConflictException("Joylashuvni faqat yo'ldagi (YO'LDA) yuk uchun yuborish mumkin");
    }

    // Mantiqsiz sakrash: oldingi nuqtadan shu vaqt ichida yetib bo'lmaydigan joy
    if (shipment.lastLat !== null && shipment.lastLng !== null && shipment.lastLocationAt && recordedAt > shipment.lastLocationAt) {
      const hours = Math.max(recordedAt.getTime() - shipment.lastLocationAt.getTime(), 1000) / 3_600_000;
      const km = haversineKm({ lat: shipment.lastLat, lng: shipment.lastLng }, { lat: dto.lat, lng: dto.lng });
      if (km / hours > MAX_PLAUSIBLE_KMH) {
        throw new UnprocessableEntityException("Joylashuv oldingi nuqtadan juda uzoq: GPS signalini tekshiring");
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Faqat yangiroq nuqta "oxirgi joylashuv"ni almashtiradi; yuk shu orada yetkazilgan bo'lsa, tegmaydi
        const updated = await tx.shipment.updateMany({
          where: {
            id: shipmentId, driverId, status: ShipmentStatus.IN_TRANSIT,
            OR: [{ lastLocationAt: null }, { lastLocationAt: { lt: recordedAt } }],
          },
          data: {
            lastLat: dto.lat, lastLng: dto.lng, lastSpeedKmh: dto.speedKmh ?? null,
            lastLocationAt: recordedAt, lastLocationSource: source,
          },
        });
        if (updated.count === 0) {
          const still = await tx.shipment.findFirst({ where: { id: shipmentId, driverId, status: ShipmentStatus.IN_TRANSIT }, select: { id: true } });
          if (!still) throw new ConflictException("Joylashuvni faqat yo'ldagi (YO'LDA) yuk uchun yuborish mumkin");
        }
        await tx.locationLog.create({
          data: {
            shipmentId, driverId, lat: dto.lat, lng: dto.lng, speedKmh: dto.speedKmh ?? null,
            accuracyM: dto.accuracyM ?? null, source, recordedAt,
          },
        });
        return { accepted: true, latest: updated.count === 1, recordedAt };
      });
    } catch (e) {
      // Bir xil vaqtli nuqta qayta yuborilgan (tarmoq qayta urinishi): xato emas
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return { accepted: false, latest: false, recordedAt, reason: 'duplicate' };
      }
      throw e;
    }
  }

  // ---------- Haydovchi, fermer, market, admin: joriy joylashuv ----------

  async current(user: any, shipmentId: string) {
    const s = await this.prisma.shipment.findFirst({
      where: { id: shipmentId, ...this.ownership(user) },
      select: {
        id: true, status: true, originRegion: true, originDistrict: true, destRegion: true, destDistrict: true,
        lastLat: true, lastLng: true, lastSpeedKmh: true, lastLocationAt: true, lastLocationSource: true,
      },
    });
    // Begona yukning mavjudligi bildirilmaydi
    if (!s) throw new NotFoundException('Yuk topilmadi');

    const tracking = s.status === ShipmentStatus.IN_TRANSIT;
    const live = tracking && s.lastLat !== null && s.lastLng !== null && s.lastLocationAt;
    const trail = tracking
      ? (await this.prisma.locationLog.findMany({
          where: { shipmentId },
          orderBy: { recordedAt: 'desc' },
          take: TRAIL_LIMIT,
          select: { lat: true, lng: true, recordedAt: true },
        })).reverse()
      : [];

    return {
      shipmentId: s.id,
      status: s.status,
      tracking,
      route: {
        origin: { region: s.originRegion, district: s.originDistrict, center: regionCenter(s.originRegion) },
        destination: { region: s.destRegion, district: s.destDistrict, center: regionCenter(s.destRegion) },
        approximate: true, // viloyat markazlari: aniq manzil emas
      },
      location: live
        ? {
            lat: s.lastLat, lng: s.lastLng, speedKmh: s.lastSpeedKmh, recordedAt: s.lastLocationAt,
            source: s.lastLocationSource,
          }
        : null,
      trail,
      serverTime: new Date(),
      ...(user.role === Role.DRIVER ? { simulationAllowed: this.env.LOCATION_ALLOW_SIMULATION } : {}),
    };
  }

  private ownership(user: any): Prisma.ShipmentWhereInput {
    if (user.role === Role.ADMIN) return {};
    if (user.role === Role.DRIVER && user.driver) return { driverId: user.driver.id };
    if (user.role === Role.FARMER && user.farmer) return { farmerId: user.farmer.id };
    if (user.role === Role.MARKET && user.market) return { marketId: user.market.id };
    throw new ForbiddenException("Bu rol uchun joylashuv mavjud emas");
  }

  // ---------- Haydovchi: ELD jurnali ----------

  async eld(driverId: string, days: number) {
    const dayMs = 86_400_000;
    // Toshkent vaqti bo'yicha kun boshi
    const localMidnight = Math.floor((Date.now() + TASHKENT_OFFSET_MS) / dayMs) * dayMs - TASHKENT_OFFSET_MS;
    const since = new Date(localMidnight - (days - 1) * dayMs);

    const rows = (await this.prisma.locationLog.findMany({
      where: { driverId, recordedAt: { gte: since } },
      orderBy: { recordedAt: 'desc' },
      take: ELD_ROW_CAP,
      select: { shipmentId: true, lat: true, lng: true, recordedAt: true },
    })).reverse();

    const summaries = summarizeDays(rows);
    const active = await this.prisma.shipment.findFirst({
      where: { driverId, status: ShipmentStatus.IN_TRANSIT },
      select: { id: true, cargoName: true, lastLocationAt: true, lastLocationSource: true },
    });

    return {
      timezone: 'Asia/Tashkent',
      dailyDrivingLimitMinutes: DAILY_DRIVING_LIMIT_MIN,
      days: summaries,
      recentStops: summaries.flatMap((d) => d.stops).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).slice(0, 10),
      current: active
        ? { shipmentId: active.id, cargoName: active.cargoName, lastLocationAt: active.lastLocationAt, source: active.lastLocationSource }
        : null,
      truncated: rows.length >= ELD_ROW_CAP,
    };
  }
}
