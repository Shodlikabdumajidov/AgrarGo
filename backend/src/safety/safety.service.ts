import { Injectable, NotFoundException } from '@nestjs/common';
import { KycStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EBolListQuery } from './safety.dto';

const EBOL_INCLUDE = {
  driver: { select: { plateNumber: true, vehicleType: true, user: { select: { fullName: true, phone: true } } } },
  farmer: { select: { farmName: true, user: { select: { fullName: true, phone: true } } } },
  shipment: { select: { id: true, cargoName: true, weightKg: true, originRegion: true, destRegion: true, status: true } },
  localOrder: { select: { id: true, quantityKg: true, status: true, product: { select: { name: true } } } },
} satisfies Prisma.EBolContractInclude;
type Row = Prisma.EBolContractGetPayload<{ include: typeof EBOL_INCLUDE }>;

const startOfTashkentDay = () => {
  const d = new Date(Date.now() + 5 * 3600_000);
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - 5 * 3600_000);
};

/** Safety panel uchun faqat o'qish: imzolangan e-BOL shartnomalari. Foydalanuvchilarni tasdiqlash KYC servisi orqali (/kyc). */
@Injectable()
export class SafetyService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const [pendingUsers, signedTotal, signedToday] = await Promise.all([
      this.prisma.user.count({ where: { kycStatus: KycStatus.PENDING } }),
      this.prisma.eBolContract.count({ where: { status: 'SIGNED' } }),
      this.prisma.eBolContract.count({ where: { status: 'SIGNED', signedAt: { gte: startOfTashkentDay() } } }),
    ]);
    return { pendingUsers, signedTotal, signedToday };
  }

  async listEbol(q: EBolListQuery) {
    const where: Prisma.EBolContractWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.kind === 'SHIPMENT' && { shipmentId: { not: null } }),
      ...(q.kind === 'LOCAL' && { localOrderId: { not: null } }),
    };
    const limit = q.limit ?? 20;
    const page = q.page ?? 1;
    const [total, rows] = await Promise.all([
      this.prisma.eBolContract.count({ where }),
      this.prisma.eBolContract.findMany({ where, orderBy: [{ signedAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit, include: EBOL_INCLUDE }),
    ]);
    return { items: rows.map((r) => this.view(r)), total, page, pages: Math.max(1, Math.ceil(total / limit)) };
  }

  async getEbol(id: string) {
    const r = await this.prisma.eBolContract.findUnique({ where: { id }, include: EBOL_INCLUDE });
    if (!r) throw new NotFoundException('Shartnoma topilmadi');
    return this.view(r);
  }

  private view(r: Row) {
    const shipment = r.shipment;
    const local = r.localOrder;
    return {
      id: r.id,
      status: r.status,
      signedAt: r.signedAt,
      kind: shipment ? ('SHIPMENT' as const) : ('LOCAL' as const),
      shipmentId: r.shipmentId,
      localOrderId: r.localOrderId,
      orderStatus: shipment?.status ?? local?.status ?? null,
      cargo: shipment
        ? { name: shipment.cargoName, weightKg: Number(shipment.weightKg), route: `${shipment.originRegion} → ${shipment.destRegion}` }
        : local ? { name: local.product.name, weightKg: Number(local.quantityKg), route: null } : null,
      driver: { id: r.driverId, fullName: r.driver.user.fullName, phone: r.driver.user.phone, plateNumber: r.driver.plateNumber },
      farmer: { id: r.farmerId, farmName: r.farmer.farmName, fullName: r.farmer.user.fullName, phone: r.farmer.user.phone },
      contractHash: r.contractHash,
    };
  }
}
