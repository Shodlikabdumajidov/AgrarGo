import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { HubIntakeStatus, OsdType, PackagingStatus, Prisma, ProductStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { regionCenter } from '../trust/geo';
import { AdjustStockDto, AnnounceIntakeDto, CreateHubDto, ListIntakesQuery, ReceiveIntakeDto, RejectIntakeDto, SetRetailDto, UpdateHubDto } from './dto/hub.dto';
import { DockService } from './dock.service';
import { addStock, adjustStock } from './hub-stock';
import { generateMasterQr, osdSplit, packagingFee } from './osd';

export interface HubUser { id: string; role: Role; hubId?: string | null; farmer?: { id: string } | null }

const HUB_PUBLIC = { id: true, name: true, region: true, district: true, address: true, isActive: true, requireDockBooking: true, packagingFeePerKg: true } satisfies Prisma.HubSelect;
const num = (d: Prisma.Decimal | null | undefined) => (d === null || d === undefined ? null : Number(d));

@Injectable()
export class HubService {
  constructor(private readonly prisma: PrismaService, private readonly docks: DockService) {}

  // ---------- Hub'lar (administrator) ----------

  list(user: HubUser) {
    return this.prisma.hub.findMany({ where: user.role === Role.ADMIN ? {} : { isActive: true }, select: { ...HUB_PUBLIC, _count: { select: { staff: true } } }, orderBy: [{ region: 'asc' }, { name: 'asc' }] });
  }

  private checkRegion(region: string) {
    if (!regionCenter(region)) throw new BadRequestException("Viloyat ro'yxatdan tanlanishi kerak (masalan: Samarqand, Toshkent shahri)");
  }

  async create(dto: CreateHubDto) {
    this.checkRegion(dto.region);
    try { return await this.prisma.hub.create({ data: { ...dto, district: dto.district || null, address: dto.address || null }, select: HUB_PUBLIC }); }
    catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Bu nomdagi Hub allaqachon mavjud'); throw e; }
  }

  async update(id: string, dto: UpdateHubDto) {
    if (dto.region) this.checkRegion(dto.region);
    try { return await this.prisma.hub.update({ where: { id }, data: dto, select: HUB_PUBLIC }); }
    catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) { if (e.code === 'P2025') throw new NotFoundException('Hub topilmadi'); if (e.code === 'P2002') throw new ConflictException('Bu nomdagi Hub allaqachon mavjud'); }
      throw e;
    }
  }

  async assignStaff(hubId: string, userId: string) {
    const [hub, u] = await Promise.all([this.prisma.hub.findUnique({ where: { id: hubId }, select: { id: true } }), this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } })]);
    if (!hub) throw new NotFoundException('Hub topilmadi');
    if (!u) throw new NotFoundException('Foydalanuvchi topilmadi');
    if (u.role !== Role.DISPATCHER) throw new BadRequestException('Hub xodimi dispetcher roli bilan bo\'lishi kerak');
    await this.prisma.user.update({ where: { id: userId }, data: { hubId } });
    return { ok: true };
  }

  async unassignStaff(hubId: string, userId: string) {
    const r = await this.prisma.user.updateMany({ where: { id: userId, hubId }, data: { hubId: null } });
    if (r.count === 0) throw new NotFoundException('Xodim bu Hub\'ga biriktirilmagan');
    return { ok: true };
  }

  /** Xodim faqat o'z Hub'ini boshqaradi; Hub'ga biriktirilmagan dispetcher va administrator — hammasini */
  scope(user: HubUser): Prisma.HubWhereInput {
    return user.role === Role.DISPATCHER && user.hubId ? { id: user.hubId } : {};
  }

  assertAccess(user: HubUser, hubId: string) {
    if (user.role === Role.DISPATCHER && user.hubId && user.hubId !== hubId) throw new ForbiddenException("Bu Hub sizga biriktirilmagan");
  }

  // ---------- Fermer: Hub orqali sotish ----------

  private farmerId(user: HubUser) {
    if (!user.farmer) throw new ForbiddenException('Fermer profili topilmadi');
    return user.farmer.id;
  }

  /** Fermerning mahsulotlari, Hub'dagi qoldig'i va chakana sotuv holati */
  async farmerOverview(user: HubUser) {
    const farmerId = this.farmerId(user);
    const products = await this.prisma.product.findMany({
      where: { farmerId, status: { not: ProductStatus.ARCHIVED } }, orderBy: { createdAt: 'desc' },
      include: { hub: { select: HUB_PUBLIC }, hubStocks: { select: { hubId: true, weightKg: true, reservedKg: true } }, hubIntakes: { where: { status: HubIntakeStatus.ANNOUNCED }, select: { id: true, declaredKg: true, hubId: true } } },
    });
    return products.map((p) => {
      const st = p.hubStocks.find((x) => x.hubId === p.hubId) ?? null;
      return {
        id: p.id, name: p.name, category: p.category, quantityKg: num(p.quantityKg), pricePerKg: num(p.pricePerKg), status: p.status,
        isRetail: p.isRetail, retailPricePerKg: num(p.retailPricePerKg), minOrderKg: num(p.minOrderKg), hub: p.hub,
        hubStock: st ? { weightKg: num(st.weightKg), reservedKg: num(st.reservedKg), availableKg: Number(st.weightKg) - Number(st.reservedKg) } : null,
        pendingIntakes: p.hubIntakes.map((i) => ({ id: i.id, hubId: i.hubId, declaredKg: num(i.declaredKg) })),
      };
    });
  }

  async announce(user: HubUser, dto: AnnounceIntakeDto) {
    const farmerId = this.farmerId(user);
    const [product, hub] = await Promise.all([
      this.prisma.product.findFirst({ where: { id: dto.productId, farmerId }, include: { hubStocks: true, hubIntakes: { where: { status: HubIntakeStatus.ANNOUNCED } } } }),
      this.prisma.hub.findUnique({ where: { id: dto.hubId } }),
    ]);
    if (!product) throw new NotFoundException("E'lon topilmadi");
    if (product.status === ProductStatus.ARCHIVED) throw new ConflictException("Arxivdagi e'lonni Hub'ga topshirib bo'lmaydi");
    if (!hub || !hub.isActive) throw new NotFoundException('Hub topilmadi yoki faol emas');
    const pending = product.hubIntakes.reduce((a, i) => a + Number(i.declaredKg), 0);
    if (dto.declaredKg + pending > Number(product.quantityKg)) throw new ConflictException(`E'longizda atigi ${Number(product.quantityKg) - pending} kg topshirish mumkin (qolgani boshqa topshirishlarga band)`);
    if (product.hubId && product.hubId !== hub.id && product.hubStocks.some((s) => s.hubId === product.hubId && Number(s.weightKg) > 0)) {
      throw new ConflictException("Bu mahsulot boshqa Hub omborida sotilmoqda. Avval o'sha qoldiq tugashini kuting");
    }
    if (dto.minOrderKg && dto.minOrderKg > dto.declaredKg) throw new BadRequestException("Eng kam buyurtma topshirilayotgan miqdordan katta bo'lmasin");
    if (hub.requireDockBooking && !dto.dockSlot) throw new ConflictException("Bu Hub'ga yuk topshirish uchun rampa va vaqtni tanlang");
    const intake = await this.prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id: product.id }, data: { hubId: hub.id, retailPricePerKg: dto.retailPricePerKg, minOrderKg: dto.minOrderKg ?? null } });
      const created = await tx.hubIntake.create({
        data: {
          hubId: hub.id, productId: product.id, farmerId, declaredKg: dto.declaredKg,
          // Master QR: quti soni ma'lum bo'lsa pallet yorlig'i darhol yaratiladi
          ...(dto.boxCount && { boxCount: dto.boxCount, masterQr: generateMasterQr(), masterQrAt: new Date() }),
          // PaaS: e'lon paytidagi narx qayd etiladi (keyin Hub narxini o'zgartirsa ham bu topshirish uchun o'zgarmaydi)
          ...(dto.usePackaging && { usePackaging: true, packagingStatus: PackagingStatus.PENDING, packagingRate: hub.packagingFeePerKg, packagingFee: packagingFee(Number(hub.packagingFeePerKg), dto.declaredKg) }),
        },
      });
      // Rampa band bo'lsa butun e'lon bekor bo'ladi (yarim holat qolmaydi)
      if (dto.dockSlot) await this.docks.bookTx(tx, user, { hubId: hub.id, purpose: 'INTAKE', intakeId: created.id, startsAt: new Date(dto.dockSlot.startsAt), dockId: dto.dockSlot.dockId, vehiclePlate: dto.dockSlot.vehiclePlate });
      return created;
    });
    return this.intakeView(intake.id);
  }

  async cancelIntake(user: HubUser, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.hubIntake.updateMany({ where: { id, farmerId: this.farmerId(user), status: HubIntakeStatus.ANNOUNCED }, data: { status: HubIntakeStatus.CANCELLED } });
      if (r.count === 0) throw new NotFoundException("Topshirish topilmadi yoki allaqachon ko'rib chiqilgan");
      await this.docks.closeForIntake(tx, id, 'CANCELLED', 'Fermer topshirishni bekor qildi');
    });
    return this.intakeView(id);
  }

  /** Chakana sotuvni yoqish/o'chirish va narx/minimumni o'zgartirish. Yoqish uchun Hub'da qoldiq bo'lishi shart. */
  async setRetail(user: HubUser, productId: string, dto: SetRetailDto) {
    const p = await this.prisma.product.findFirst({ where: { id: productId, farmerId: this.farmerId(user) }, include: { hubStocks: true } });
    if (!p) throw new NotFoundException("E'lon topilmadi");
    const data: Prisma.ProductUpdateInput = {};
    if (dto.retailPricePerKg !== undefined) data.retailPricePerKg = dto.retailPricePerKg;
    if (dto.minOrderKg !== undefined) data.minOrderKg = dto.minOrderKg;
    if (dto.isRetail === true) {
      const stock = p.hubStocks.find((s) => s.hubId === p.hubId);
      if (!p.hubId || !stock || Number(stock.weightKg) <= 0) throw new ConflictException("Chakana sotuvni yoqish uchun avval mahsulotni Hub omboriga topshiring");
      if (!(dto.retailPricePerKg ?? p.retailPricePerKg)) throw new BadRequestException('Chakana narxni kiriting');
      data.isRetail = true;
    } else if (dto.isRetail === false) data.isRetail = false;
    await this.prisma.product.update({ where: { id: p.id }, data });
    return (await this.farmerOverview(user)).find((x) => x.id === p.id);
  }

  // ---------- Hub xodimi ----------

  async intakeView(id: string) {
    const i = await this.prisma.hubIntake.findUniqueOrThrow({ where: { id }, include: { hub: { select: HUB_PUBLIC }, product: { select: { name: true, category: true, farmer: { select: { farmName: true } } } }, appointment: { include: { hub: { select: { name: true } }, dock: { select: { number: true, name: true } } } } } });
    return { id: i.id, dock: i.appointment ? this.docks.brief(i.appointment) : null, status: i.status, declaredKg: num(i.declaredKg), receivedKg: num(i.receivedKg), note: i.note, createdAt: i.createdAt, receivedAt: i.receivedAt, hub: { ...i.hub, packagingFeePerKg: num(i.hub.packagingFeePerKg) },
      boxCount: i.boxCount, masterQr: i.masterQr, damagedBoxes: i.damagedBoxes, kgPerBox: i.boxCount ? Math.round((Number(i.declaredKg) / i.boxCount) * 100) / 100 : null,
      usePackaging: i.usePackaging, packagingStatus: i.packagingStatus, packagingRate: num(i.packagingRate), packagingFee: num(i.packagingFee), packagedAt: i.packagedAt,
      productId: i.productId, productName: i.product.name, category: i.product.category, farmName: i.product.farmer.farmName };
  }

  async listIntakes(user: HubUser, q: ListIntakesQuery) {
    const where: Prisma.HubIntakeWhereInput = { ...(q.status && { status: q.status }) };
    if (user.role === Role.FARMER) where.farmerId = this.farmerId(user);
    else { where.hub = this.scope(user); if (q.hubId) { this.assertAccess(user, q.hubId); where.hubId = q.hubId; } }
    const rows = await this.prisma.hubIntake.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true } });
    return Promise.all(rows.map((r) => this.intakeView(r.id)));
  }

  /** Qabul: haqiqiy vazn kiritiladi, fermer e'lonidagi miqdor kamayadi, Hub qoldig'i oshadi (bitta tranzaksiya) */
  async receive(user: HubUser, id: string, dto: ReceiveIntakeDto) {
    const intake = await this.prisma.hubIntake.findUnique({ where: { id } });
    if (!intake) throw new NotFoundException('Topshirish topilmadi');
    this.assertAccess(user, intake.hubId);
    if (dto.receivedKg > Number(intake.declaredKg)) throw new BadRequestException(`Qabul qilingan vazn e'lon qilingan miqdordan (${Number(intake.declaredKg)} kg) oshmasligi kerak`);
    await this.prisma.$transaction((tx) => this.finishIntake(tx, intake, { receivedKg: dto.receivedKg, damagedKg: 0, damagedBoxes: 0, note: dto.note, userId: user.id }));
    return this.intakeView(id);
  }

  /**
   * Qabulni yakunlash (oddiy va QR-skaner orqali qabul uchun umumiy), chaqiruvchining tranzaksiyasida:
   * holat o'zgaradi, fermer e'lonidagi miqdor (qabul qilingan + yaroqsiz) kamayadi, Hub qoldig'iga faqat yaroqli qism qo'shiladi,
   * OS&D yozuvi yoziladi va qadoqlash haqi haqiqiy vaznga qayta hisoblanadi.
   */
  async finishIntake(
    tx: Prisma.TransactionClient,
    intake: { id: string; hubId: string; productId: string; farmerId: string; declaredKg: Prisma.Decimal; boxCount: number | null; usePackaging: boolean; packagingRate: Prisma.Decimal | null },
    r: { receivedKg: number; damagedKg: number; damagedBoxes: number; note?: string; userId: string },
  ) {
    const claimed = await tx.hubIntake.updateMany({
      where: { id: intake.id, status: HubIntakeStatus.ANNOUNCED },
      data: {
        status: HubIntakeStatus.RECEIVED, receivedKg: r.receivedKg, receivedAt: new Date(), receivedById: r.userId, note: r.note || null, damagedBoxes: r.damagedBoxes,
        ...(intake.usePackaging && { packagingFee: packagingFee(Number(intake.packagingRate ?? 0), r.receivedKg) }),
      },
    });
    if (claimed.count === 0) throw new ConflictException("Bu topshirish allaqachon ko'rib chiqilgan");
    const debit = new Prisma.Decimal(r.receivedKg).add(r.damagedKg); // yaroqsiz qism ham fermer qoldig'idan chiqadi (jismonan topshirilgan)
    const dec = await tx.$executeRaw`UPDATE "Product" SET "quantityKg" = "quantityKg" - ${debit}, "updatedAt" = now() WHERE id = ${intake.productId} AND "quantityKg" >= ${debit}`;
    if (dec === 0) throw new ConflictException("Fermer e'lonida yetarli qoldiq yo'q: miqdor allaqachon boshqa bronlarga ketgan bo'lishi mumkin");
    await tx.product.updateMany({ where: { id: intake.productId, quantityKg: 0, status: ProductStatus.ACTIVE }, data: { status: ProductStatus.BOOKED } });
    await tx.product.update({ where: { id: intake.productId }, data: { isRetail: true, hubId: intake.hubId } });
    await addStock(tx, intake.hubId, intake.productId, r.receivedKg, { type: 'HUB_INTAKE', id: intake.id }, r.note);
    const declared = Number(intake.declaredKg);
    const lossKg = r.damagedKg > 0 ? r.damagedKg : Math.round((declared - r.receivedKg) * 100) / 100;
    if (lossKg > 0) {
      await tx.hubOsd.create({
        data: {
          intakeId: intake.id, hubId: intake.hubId, productId: intake.productId, farmerId: intake.farmerId,
          type: r.damagedKg > 0 ? OsdType.DAMAGED : OsdType.SHORT, totalBoxes: intake.boxCount, damagedBoxes: r.damagedBoxes || null,
          expectedKg: declared, receivedKg: r.receivedKg, lossKg, note: r.note || null, reportedById: r.userId,
        },
      });
    }
    await this.docks.closeForIntake(tx, intake.id, 'DONE');
  }

  async reject(user: HubUser, id: string, dto: RejectIntakeDto) {
    const intake = await this.prisma.hubIntake.findUnique({ where: { id }, select: { hubId: true } });
    if (!intake) throw new NotFoundException('Topshirish topilmadi');
    this.assertAccess(user, intake.hubId);
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.hubIntake.updateMany({ where: { id, status: HubIntakeStatus.ANNOUNCED }, data: { status: HubIntakeStatus.REJECTED, note: dto.note, receivedById: user.id, receivedAt: new Date() } });
      if (r.count === 0) throw new ConflictException("Bu topshirish allaqachon ko'rib chiqilgan");
      await this.docks.closeForIntake(tx, id, 'CANCELLED', 'Hub topshirishni rad etdi');
    });
    return this.intakeView(id);
  }

  async stock(user: HubUser, hubId?: string) {
    if (hubId) this.assertAccess(user, hubId);
    const rows = await this.prisma.hubStock.findMany({
      where: { hub: this.scope(user), ...(hubId && { hubId }) }, orderBy: { updatedAt: 'desc' }, take: 200,
      include: { hub: { select: HUB_PUBLIC }, product: { select: { id: true, name: true, category: true, isRetail: true, retailPricePerKg: true, minOrderKg: true, farmer: { select: { farmName: true } } } }, movements: { orderBy: { createdAt: 'desc' }, take: 8 } },
    });
    return rows.map((s) => ({
      id: s.id, hub: s.hub, productId: s.product.id, name: s.product.name, category: s.product.category, farmName: s.product.farmer.farmName,
      isRetail: s.product.isRetail, retailPricePerKg: num(s.product.retailPricePerKg), minOrderKg: num(s.product.minOrderKg),
      weightKg: num(s.weightKg), reservedKg: num(s.reservedKg), availableKg: Number(s.weightKg) - Number(s.reservedKg),
      movements: s.movements.map((m) => ({ type: m.type, quantityKg: num(m.quantityKg), refType: m.refType, note: m.note, createdAt: m.createdAt })),
    }));
  }

  async adjust(user: HubUser, stockId: string, dto: AdjustStockDto) {
    const st = await this.prisma.hubStock.findUnique({ where: { id: stockId }, select: { hubId: true } });
    if (!st) throw new NotFoundException('Qoldiq topilmadi');
    this.assertAccess(user, st.hubId);
    await this.prisma.$transaction((tx) => adjustStock(tx, stockId, dto.deltaKg, dto.note));
    return (await this.stock(user, st.hubId)).find((x) => x.id === stockId);
  }

}
