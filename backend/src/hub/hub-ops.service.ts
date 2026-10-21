import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { HubIntakeStatus, PackagingStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MasterQrDto, OsdQuery, ScanReceiveDto } from './dto/hub.dto';
import { HubService, HubUser } from './hub.service';
import { generateMasterQr, normalizeQr, osdSplit } from './osd';

const num = (d: Prisma.Decimal | null | undefined) => (d === null || d === undefined ? null : Number(d));
const qrTaken = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/** Hub operatsiyalari: Master QR (pallet), skaner orqali qabul (OS&D), OS&D hisoboti va qadoqlash xizmati (PaaS) */
@Injectable()
export class HubOpsService {
  constructor(private readonly prisma: PrismaService, private readonly hubs: HubService) {}

  // ---------- Master QR ----------

  /** Partiyaga (pallet) bitta Master QR biriktirish: «1 QR = N quti». Fermer o'z topshirishiga, Hub xodimi — o'z Hub'idagiga. Qabulgacha. */
  async attachMasterQr(user: HubUser, intakeId: string, dto: MasterQrDto) {
    const intake = await this.prisma.hubIntake.findUnique({ where: { id: intakeId }, select: { hubId: true, farmerId: true, status: true, masterQr: true } });
    if (!intake) throw new NotFoundException('Topshirish topilmadi');
    if (user.role === Role.FARMER) { if (!user.farmer || user.farmer.id !== intake.farmerId) throw new NotFoundException('Topshirish topilmadi'); }
    else this.hubs.assertAccess(user, intake.hubId);
    if (intake.status !== HubIntakeStatus.ANNOUNCED) throw new ConflictException("QR faqat qabul qilinmagan topshirishga biriktiriladi");
    if (intake.masterQr && dto.code && dto.code !== intake.masterQr) throw new ConflictException(`Bu partiyaga allaqachon ${intake.masterQr} QR kodi biriktirilgan`);
    try {
      await this.prisma.hubIntake.update({
        where: { id: intakeId },
        data: { boxCount: dto.boxCount, ...(!intake.masterQr && { masterQr: dto.code ?? generateMasterQr(), masterQrAt: new Date() }) },
      });
    } catch (e) {
      if (qrTaken(e)) throw new ConflictException("Bu QR kod boshqa partiyaga biriktirilgan");
      throw e;
    }
    return this.hubs.intakeView(intakeId);
  }

  private async byQr(user: HubUser, rawCode: string) {
    const code = normalizeQr(rawCode);
    const intake = await this.prisma.hubIntake.findUnique({ where: { masterQr: code } });
    if (!intake) throw new NotFoundException('Bunday Master QR topilmadi');
    this.hubs.assertAccess(user, intake.hubId);
    return intake;
  }

  /** QR skanerlanganda: partiya haqida ma'lumot va qanday qabul qilish mumkinligi */
  async lookup(user: HubUser, code: string) {
    const intake = await this.byQr(user, code);
    const view = await this.hubs.intakeView(intake.id);
    return { ...view, canReceive: intake.status === HubIntakeStatus.ANNOUNCED && !!intake.boxCount };
  }

  /** To'liq qabul yoki qisman ziyon: yaroqsiz qutilar soni kiritiladi, vazn va qoldiq shunga moslanadi (OS&D yoziladi) */
  async receiveByQr(user: HubUser, code: string, dto: ScanReceiveDto) {
    const intake = await this.byQr(user, code);
    if (intake.status !== HubIntakeStatus.ANNOUNCED) throw new ConflictException("Bu partiya allaqachon ko'rib chiqilgan");
    if (!intake.boxCount) throw new ConflictException("Partiyada quti soni belgilanmagan: avval Master QR'ga quti sonini kiriting");
    const damaged = dto.mode === 'PARTIAL' ? dto.damagedBoxes : 0;
    if (dto.mode === 'PARTIAL') {
      if (!damaged) throw new BadRequestException('Yaroqsiz qutilar sonini kiriting');
      if (damaged >= intake.boxCount) throw new BadRequestException(`Yaroqsiz qutilar soni ${intake.boxCount} dan kam bo'lsin. Hammasi yaroqsiz bo'lsa topshirishni rad eting`);
    } else if (dto.damagedBoxes) throw new BadRequestException("To'liq qabulda yaroqsiz qutilar bo'lmaydi: «Qisman ziyon» ni tanlang");
    const split = osdSplit(Number(intake.declaredKg), intake.boxCount, damaged ?? 0);
    await this.prisma.$transaction((tx) => this.hubs.finishIntake(tx, intake, { receivedKg: split.receivedKg, damagedKg: split.damagedKg, damagedBoxes: damaged ?? 0, note: dto.note, userId: user.id }));
    return this.hubs.intakeView(intake.id);
  }

  // ---------- OS&D hisobotlari ----------

  async osdReport(user: HubUser, q: OsdQuery) {
    if (q.hubId) this.hubs.assertAccess(user, q.hubId);
    const where: Prisma.HubOsdWhereInput = {
      hub: this.hubs.scope(user), ...(q.hubId && { hubId: q.hubId }),
      ...((q.from || q.to) && { createdAt: { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lte: new Date(q.to) }) } }),
    };
    const limit = q.limit ?? 20, page = q.page ?? 1;
    const [total, agg, byType, rows] = await Promise.all([
      this.prisma.hubOsd.count({ where }),
      this.prisma.hubOsd.aggregate({ where, _sum: { lossKg: true, damagedBoxes: true, expectedKg: true } }),
      this.prisma.hubOsd.groupBy({ by: ['type'], where, _count: true, _sum: { lossKg: true } }),
      this.prisma.hubOsd.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
        include: { hub: { select: { name: true } }, intake: { select: { masterQr: true, boxCount: true, product: { select: { name: true, farmer: { select: { farmName: true } } } }, receivedBy: { select: { fullName: true } } } } },
      }),
    ]);
    const lossKg = num(agg._sum.lossKg) ?? 0, expectedKg = num(agg._sum.expectedKg) ?? 0;
    return {
      summary: {
        count: total, lossKg, damagedBoxes: agg._sum.damagedBoxes ?? 0, expectedKg, lossPercent: expectedKg ? Math.round((lossKg / expectedKg) * 1000) / 10 : 0,
        byType: Object.fromEntries(byType.map((t) => [t.type, { count: t._count, lossKg: num(t._sum.lossKg) ?? 0 }])),
      },
      items: rows.map((r) => ({
        id: r.id, intakeId: r.intakeId, type: r.type, createdAt: r.createdAt, hub: r.hub.name, masterQr: r.intake.masterQr,
        productName: r.intake.product.name, farmName: r.intake.product.farmer.farmName, totalBoxes: r.totalBoxes, damagedBoxes: r.damagedBoxes,
        expectedKg: num(r.expectedKg), receivedKg: num(r.receivedKg), lossKg: num(r.lossKg), note: r.note, reportedBy: r.intake.receivedBy?.fullName ?? null,
      })),
      total, page, pages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // ---------- PaaS: qadoqlash ----------

  /** Hub xodimi uchun «Qadoqlanishi kerak bo'lgan yuklar»: qadoqlash xizmati tanlangan va hali bajarilmagan topshirishlar */
  async packagingQueue(user: HubUser, hubId?: string) {
    if (hubId) this.hubs.assertAccess(user, hubId);
    const rows = await this.prisma.hubIntake.findMany({
      where: { usePackaging: true, packagingStatus: PackagingStatus.PENDING, status: { in: [HubIntakeStatus.ANNOUNCED, HubIntakeStatus.RECEIVED] }, hub: this.hubs.scope(user), ...(hubId && { hubId }) },
      orderBy: [{ status: 'desc' }, { createdAt: 'asc' }], take: 200, select: { id: true },
    });
    return Promise.all(rows.map((r) => this.hubs.intakeView(r.id)));
  }

  /** Qadoqlandi: faqat Hub qabul qilgan (omborda turgan) yuk uchun */
  async markPackaged(user: HubUser, id: string) {
    const intake = await this.prisma.hubIntake.findUnique({ where: { id }, select: { hubId: true } });
    if (!intake) throw new NotFoundException('Topshirish topilmadi');
    this.hubs.assertAccess(user, intake.hubId);
    const r = await this.prisma.hubIntake.updateMany({
      where: { id, usePackaging: true, packagingStatus: PackagingStatus.PENDING, status: HubIntakeStatus.RECEIVED },
      data: { packagingStatus: PackagingStatus.DONE, packagedAt: new Date(), packagedById: user.id },
    });
    if (r.count === 0) throw new ConflictException("Qadoqlash faqat qabul qilingan va qadoqlash kutilayotgan yuk uchun belgilanadi");
    return this.hubs.intakeView(id);
  }
}
