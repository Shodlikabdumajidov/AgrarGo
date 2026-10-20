import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DockApptStatus, DockPurpose, HubIntakeStatus, Prisma, Role } from '@prisma/client';
import { APP_ENV } from '../config/app-env.module';
import { AppEnv } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { BookDockDto, CreateDockDto, DockSettingsDto, UpdateDockDto } from './dto/dock.dto';
import { DockHours, daySlots, hhmm, isDateStr, isOnGrid, localDate, localDayStart, overlaps, parseHHMM, slotLabel } from './dock-time';

export interface DockUser { id: string; role: Role; hubId?: string | null; farmer?: { id: string } | null; driver?: { id: string; courierMode: boolean; courierHubId: string | null } | null }
type Tx = Prisma.TransactionClient;

const ACTIVE: DockApptStatus[] = [DockApptStatus.BOOKED, DockApptStatus.ARRIVED];
const APPT_INCLUDE = {
  hub: { select: { id: true, name: true } },
  dock: { select: { id: true, number: true, name: true } },
  bookedBy: { select: { fullName: true, phone: true, role: true } },
  intake: { select: { declaredKg: true, product: { select: { name: true } } } },
  orders: { select: { id: true, quantityKg: true, product: { select: { name: true } } } },
} satisfies Prisma.DockAppointmentInclude;
type ApptRow = Prisma.DockAppointmentGetPayload<{ include: typeof APPT_INCLUDE }>;
/** Boshqa modullarga beriladigan qisqa ko'rinish (yorliq/badge uchun) */
export interface DockBrief { id: string; status: DockApptStatus; purpose: DockPurpose; hubName: string; dockNumber: number; dockName: string | null; startsAt: Date; endsAt: Date; timeSlot: string; date: string }

@Injectable()
export class DockService {
  constructor(private readonly prisma: PrismaService, @Inject(APP_ENV) private readonly env: AppEnv) {}

  private get off() { return this.env.DOCK_UTC_OFFSET_MIN; }

  // ---------- Ko'rinishlar ----------

  brief(a: { id: string; status: DockApptStatus; purpose: DockPurpose; startsAt: Date; endsAt: Date; hub: { name: string }; dock: { number: number; name: string | null } }): DockBrief {
    return { id: a.id, status: a.status, purpose: a.purpose, hubName: a.hub.name, dockNumber: a.dock.number, dockName: a.dock.name, startsAt: a.startsAt, endsAt: a.endsAt, timeSlot: slotLabel(a.startsAt, a.endsAt, this.off), date: localDate(a.startsAt, this.off) };
  }

  private full(a: ApptRow, staff: boolean) {
    return {
      ...this.brief(a), vehiclePlate: a.vehiclePlate, note: a.note, cancelReason: a.cancelReason, arrivedAt: a.arrivedAt, completedAt: a.completedAt, hubId: a.hub.id, dockId: a.dock.id,
      ...(staff && {
        bookedBy: { name: a.bookedBy.fullName, phone: a.bookedBy.phone, role: a.bookedBy.role },
        intake: a.intake ? { productName: a.intake.product.name, declaredKg: Number(a.intake.declaredKg) } : null,
        orders: a.orders.map((o) => ({ id: o.id, productName: o.product.name, quantityKg: Number(o.quantityKg) })),
      }),
      orderCount: a.orders.length,
    };
  }

  private hoursOf(h: DockHours) { return { slotMinutes: h.slotMinutes, openTime: hhmm(h.dockOpenMin), closeTime: hhmm(h.dockCloseMin) }; }

  // ---------- Ruxsat ----------

  /** Hub xodimi o'z Hub'ini, Hub'ga biriktirilmagan dispetcher va administrator — hammasini boshqaradi */
  private assertStaff(user: DockUser, hubId: string) {
    if (user.role === Role.ADMIN) return;
    if (user.role === Role.DISPATCHER && (!user.hubId || user.hubId === hubId)) return;
    throw new ForbiddenException("Bu Hub rampalarini boshqarish huquqingiz yo'q");
  }

  private async hubOrThrow(hubId: string, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const hub = await db.hub.findUnique({ where: { id: hubId }, include: { docks: { orderBy: { number: 'asc' } } } });
    if (!hub) throw new NotFoundException('Hub topilmadi');
    return hub;
  }

  // ---------- Darvozalar (rampalar) boshqaruvi ----------

  async overview(hubId: string) {
    const hub = await this.hubOrThrow(hubId);
    return {
      hub: { id: hub.id, name: hub.name, isActive: hub.isActive, ...this.hoursOf(hub), requireDockBooking: hub.requireDockBooking },
      utcOffsetMin: this.off,
      docks: hub.docks.map((d) => ({ id: d.id, number: d.number, name: d.name, isActive: d.isActive })),
    };
  }

  async addDock(user: DockUser, hubId: string, dto: CreateDockDto) {
    this.assertStaff(user, hubId);
    await this.hubOrThrow(hubId);
    const number = dto.number ?? ((await this.prisma.hubDock.aggregate({ where: { hubId }, _max: { number: true } }))._max.number ?? 0) + 1;
    try { await this.prisma.hubDock.create({ data: { hubId, number, name: dto.name || null } }); }
    catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(`${number}-sonli rampa allaqachon mavjud`); throw e; }
    return this.overview(hubId);
  }

  private async futureActive(dockId: string, db: Tx | PrismaService = this.prisma) {
    return db.dockAppointment.count({ where: { dockId, slotLock: { not: null }, endsAt: { gt: new Date() } } });
  }

  private async dockOrThrow(hubId: string, dockId: string) {
    const d = await this.prisma.hubDock.findFirst({ where: { id: dockId, hubId } });
    if (!d) throw new NotFoundException('Rampa topilmadi');
    return d;
  }

  async updateDock(user: DockUser, hubId: string, dockId: string, dto: UpdateDockDto) {
    this.assertStaff(user, hubId);
    const d = await this.dockOrThrow(hubId, dockId);
    if (dto.isActive === false && d.isActive) {
      const n = await this.futureActive(dockId);
      if (n > 0) throw new ConflictException(`Bu rampada ${n} ta kelgusi yozuv bor. Avval ularni bekor qiling yoki boshqa rampaga o'tkazing`);
    }
    await this.prisma.hubDock.update({ where: { id: dockId }, data: { ...(dto.name !== undefined && { name: dto.name || null }), ...(dto.isActive !== undefined && { isActive: dto.isActive }) } });
    return this.overview(hubId);
  }

  /** O'chirish: tarixi bo'lmasa butunlay, bo'lsa faol emas holatga o'tkaziladi (arxiv yozuvlari saqlanadi) */
  async removeDock(user: DockUser, hubId: string, dockId: string) {
    this.assertStaff(user, hubId);
    await this.dockOrThrow(hubId, dockId);
    const n = await this.futureActive(dockId);
    if (n > 0) throw new ConflictException(`Bu rampada ${n} ta kelgusi yozuv bor. Avval ularni bekor qiling`);
    const history = await this.prisma.dockAppointment.count({ where: { dockId } });
    if (history > 0) await this.prisma.hubDock.update({ where: { id: dockId }, data: { isActive: false } });
    else await this.prisma.hubDock.delete({ where: { id: dockId } });
    return { ...(await this.overview(hubId)), removed: history === 0, deactivated: history > 0 };
  }

  async updateSettings(user: DockUser, hubId: string, dto: DockSettingsDto) {
    this.assertStaff(user, hubId);
    const hub = await this.hubOrThrow(hubId);
    const open = dto.openTime !== undefined ? parseHHMM(dto.openTime) : hub.dockOpenMin;
    const close = dto.closeTime !== undefined ? parseHHMM(dto.closeTime) : hub.dockCloseMin;
    const slot = dto.slotMinutes ?? hub.slotMinutes;
    if (open === null || close === null) throw new BadRequestException("Vaqt HH:MM ko'rinishida bo'lsin");
    if (open >= close) throw new BadRequestException("Ochilish vaqti yopilishdan oldin bo'lishi kerak");
    if (close - open < slot) throw new BadRequestException("Ish vaqti kamida bitta slotga yetishi kerak");
    // Jadval o'zgarsa kelgusidagi faol yozuvlar yangi to'rga tushmay qolmasin
    const next = { slotMinutes: slot, dockOpenMin: open, dockCloseMin: close };
    const future = await this.prisma.dockAppointment.findMany({ where: { hubId, slotLock: { not: null }, endsAt: { gt: new Date() } }, select: { startsAt: true, endsAt: true } });
    const bad = future.filter((a) => !isOnGrid(a.startsAt, next, this.off) || a.endsAt.getTime() - a.startsAt.getTime() !== slot * 60_000).length;
    if (bad > 0 && (dto.slotMinutes !== undefined || dto.openTime !== undefined || dto.closeTime !== undefined)) {
      const changed = slot !== hub.slotMinutes || open !== hub.dockOpenMin || close !== hub.dockCloseMin;
      if (changed) throw new ConflictException(`Kelgusida ${bad} ta yozuv bor: yangi jadvalga to'g'ri kelmaydi. Avval ularni bekor qiling`);
    }
    await this.prisma.hub.update({ where: { id: hubId }, data: { slotMinutes: slot, dockOpenMin: open, dockCloseMin: close, ...(dto.requireDockBooking !== undefined && { requireDockBooking: dto.requireDockBooking }) } });
    return this.overview(hubId);
  }

  // ---------- Bandlik jadvali ----------

  private checkDate(date: string, past: boolean) {
    if (!isDateStr(date)) throw new BadRequestException("Sana YYYY-MM-DD ko'rinishida bo'lsin");
    if (past) return;
    const today = localDate(new Date(), this.off);
    if (date < today) throw new BadRequestException("O'tgan kunni tanlab bo'lmaydi");
    const max = localDate(new Date(Date.now() + this.env.DOCK_MAX_DAYS_AHEAD * 86_400_000), this.off);
    if (date > max) throw new BadRequestException(`Rampani ko'pi bilan ${this.env.DOCK_MAX_DAYS_AHEAD} kun oldin band qilish mumkin`);
  }

  private dayRange(date: string) {
    const from = localDayStart(date, this.off);
    return { from, to: new Date(from.getTime() + 86_400_000) };
  }

  /** Band qilish uchun: kun bo'yicha har bir rampaning bo'sh/band slotlari (boshqalarning ma'lumoti ko'rinmaydi) */
  async slots(user: DockUser, hubId: string, date: string) {
    this.checkDate(date, false);
    const hub = await this.hubOrThrow(hubId);
    if (!hub.isActive) throw new NotFoundException('Hub faol emas');
    const { from, to } = this.dayRange(date);
    const appts = await this.prisma.dockAppointment.findMany({ where: { hubId, slotLock: { not: null }, startsAt: { lt: to }, endsAt: { gt: from } }, select: { dockId: true, startsAt: true, endsAt: true, bookedById: true } });
    const grid = daySlots(date, hub, this.off);
    const now = Date.now();
    const docks = hub.docks.filter((d) => d.isActive).map((d) => ({
      id: d.id, number: d.number, name: d.name,
      slots: grid.map((g) => {
        const hit = appts.find((a) => a.dockId === d.id && overlaps(a.startsAt, a.endsAt, g.startsAt, g.endsAt));
        const status = g.endsAt.getTime() <= now ? 'past' : hit ? (hit.bookedById === user.id ? 'mine' : 'busy') : 'free';
        return { startsAt: g.startsAt, endsAt: g.endsAt, timeSlot: slotLabel(g.startsAt, g.endsAt, this.off), status };
      }),
    }));
    // Umumiy ko'rinish: har bir slotda nechta rampa bo'sh (tizim bo'shini o'zi tanlaydi)
    const free = grid.map((g, i) => ({ startsAt: g.startsAt, timeSlot: slotLabel(g.startsAt, g.endsAt, this.off), freeDocks: docks.filter((d) => d.slots[i].status === 'free').length, past: g.endsAt.getTime() <= now }));
    return { hub: { id: hub.id, name: hub.name, ...this.hoursOf(hub), requireDockBooking: hub.requireDockBooking }, date, docks, free };
  }

  /** Hub xodimi uchun: kunning to'liq jadvali (Gantt) — kim, qaysi rampa, qaysi vaqt, holati */
  async schedule(user: DockUser, hubId: string, date: string) {
    this.assertStaff(user, hubId);
    this.checkDate(date, true);
    const hub = await this.hubOrThrow(hubId);
    const { from, to } = this.dayRange(date);
    const rows = await this.prisma.dockAppointment.findMany({ where: { hubId, status: { not: DockApptStatus.CANCELLED }, startsAt: { lt: to }, endsAt: { gt: from } }, include: APPT_INCLUDE, orderBy: { startsAt: 'asc' } });
    return {
      hub: { id: hub.id, name: hub.name, isActive: hub.isActive, ...this.hoursOf(hub), requireDockBooking: hub.requireDockBooking }, date, utcOffsetMin: this.off,
      openMin: hub.dockOpenMin, closeMin: hub.dockCloseMin,
      docks: hub.docks.filter((d) => d.isActive || rows.some((r) => r.dockId === d.id)).map((d) => ({ id: d.id, number: d.number, name: d.name, isActive: d.isActive })),
      appointments: rows.map((r) => ({ ...this.full(r, true), startMin: Math.round((r.startsAt.getTime() - from.getTime()) / 60_000), endMin: Math.round((r.endsAt.getTime() - from.getTime()) / 60_000) })),
    };
  }

  async mine(user: DockUser) {
    const rows = await this.prisma.dockAppointment.findMany({ where: { bookedById: user.id, endsAt: { gt: new Date(Date.now() - 86_400_000) }, status: { not: DockApptStatus.CANCELLED } }, include: APPT_INCLUDE, orderBy: { startsAt: 'asc' }, take: 50 });
    return rows.map((r) => this.full(r, false));
  }

  // ---------- Band qilish (to'qnashuvsiz) ----------

  async book(user: DockUser, dto: BookDockDto) {
    const id = await this.prisma.$transaction((tx) => this.bookTx(tx, user, { ...dto, startsAt: new Date(dto.startsAt) }));
    return this.get(user, id);
  }

  /**
   * Bitta tranzaksiya ichida: Hub bo'yicha qulf (bir vaqtdagi so'rovlar ketma-ket bajariladi) -> slot to'riga mosligi -> rampa va foydalanuvchi
   * kesishuvi -> yozish. Bazadagi UNIQUE(dockId, startsAt, slotLock) oxirgi to'siq (P2002 -> 409).
   */
  async bookTx(tx: Tx, user: DockUser, dto: { hubId: string; purpose: DockPurpose; startsAt: Date; dockId?: string; intakeId?: string; vehiclePlate?: string; note?: string }): Promise<string> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'dock:' + dto.hubId}))`;
    const hub = await this.hubOrThrow(dto.hubId, tx);
    if (!hub.isActive) throw new NotFoundException('Hub topilmadi yoki faol emas');
    const docks = hub.docks.filter((d) => d.isActive);
    if (!docks.length) throw new ConflictException("Bu Hub'da hozircha rampa (darvoza) yo'q");
    if (Number.isNaN(dto.startsAt.getTime())) throw new BadRequestException("Vaqt noto'g'ri");
    if (!isOnGrid(dto.startsAt, hub, this.off)) throw new BadRequestException(`Vaqt slot jadvaliga mos emas (${hhmm(hub.dockOpenMin)}–${hhmm(hub.dockCloseMin)}, har ${hub.slotMinutes} daqiqa)`);
    const startsAt = dto.startsAt, endsAt = new Date(startsAt.getTime() + hub.slotMinutes * 60_000);
    if (endsAt.getTime() <= Date.now()) throw new BadRequestException("Bu vaqt o'tib ketgan");
    if (startsAt.getTime() > Date.now() + this.env.DOCK_MAX_DAYS_AHEAD * 86_400_000) throw new BadRequestException(`Rampani ko'pi bilan ${this.env.DOCK_MAX_DAYS_AHEAD} kun oldin band qilish mumkin`);

    // Maqsadga xos qoidalar
    let intakeId: string | null = null;
    if (dto.purpose === DockPurpose.INTAKE) {
      if (!user.farmer) throw new ForbiddenException('Yuk topshirish uchun fermer bo\'lishingiz kerak');
      if (!dto.intakeId) throw new BadRequestException('Topshirish (intake) identifikatori kerak');
      const intake = await tx.hubIntake.findFirst({ where: { id: dto.intakeId, farmerId: user.farmer.id } });
      if (!intake) throw new NotFoundException('Topshirish topilmadi');
      if (intake.hubId !== hub.id) throw new BadRequestException('Topshirish boshqa Hub uchun e\'lon qilingan');
      if (intake.status !== HubIntakeStatus.ANNOUNCED) throw new ConflictException("Bu topshirish allaqachon ko'rib chiqilgan");
      // Vaqtni o'zgartirish: eski yozuv shu tranzaksiyada bo'shatiladi
      await tx.dockAppointment.updateMany({ where: { intakeId: intake.id, slotLock: { not: null } }, data: { status: DockApptStatus.CANCELLED, slotLock: null, cancelReason: "Vaqt o'zgartirildi" } });
      await tx.dockAppointment.updateMany({ where: { intakeId: intake.id }, data: { intakeId: null } });
      intakeId = intake.id;
    } else {
      if (user.role !== Role.DRIVER || !user.driver) throw new ForbiddenException('Yuk olish uchun haydovchi bo\'lishingiz kerak');
      if (!user.driver.courierMode || user.driver.courierHubId !== hub.id) throw new ForbiddenException("Avval shu Hub uchun «Shahar ichi kuryeri» rejimini yoqing");
    }

    // Foydalanuvchi cheklovlari: bir vaqtda ikki joyda bo'la olmaydi va rampalarni "ushlab turmaydi"
    const mine = await tx.dockAppointment.findMany({ where: { bookedById: user.id, slotLock: { not: null }, endsAt: { gt: new Date() } }, select: { startsAt: true, endsAt: true } });
    if (mine.some((a) => overlaps(a.startsAt, a.endsAt, startsAt, endsAt))) throw new ConflictException('Siz shu vaqtda boshqa rampaga yozilgansiz');
    if (mine.length >= this.env.DOCK_MAX_ACTIVE_PER_USER) throw new ConflictException(`Bir vaqtda ${this.env.DOCK_MAX_ACTIVE_PER_USER} tadan ortiq faol yozuv bo'lishi mumkin emas`);

    // Rampa tanlash: ko'rsatilgan bo'lsa — o'sha, aks holda eng kichik raqamli bo'sh rampa
    const candidates = dto.dockId ? docks.filter((d) => d.id === dto.dockId) : docks;
    if (dto.dockId && !candidates.length) throw new NotFoundException('Rampa topilmadi yoki faol emas');
    const busy = await tx.dockAppointment.findMany({ where: { dockId: { in: candidates.map((d) => d.id) }, slotLock: { not: null }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } }, select: { dockId: true } });
    const busyIds = new Set(busy.map((b) => b.dockId));
    const dock = candidates.find((d) => !busyIds.has(d.id));
    if (!dock) throw new ConflictException(dto.dockId ? 'Bu rampa shu vaqtda band' : "Shu vaqtda bo'sh rampa qolmadi. Boshqa vaqtni tanlang");

    try {
      const a = await tx.dockAppointment.create({
        data: { hubId: hub.id, dockId: dock.id, purpose: dto.purpose, startsAt, endsAt, bookedById: user.id, vehiclePlate: dto.vehiclePlate?.toUpperCase() || null, note: dto.note || null, intakeId },
        select: { id: true },
      });
      return a.id;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Bu rampa shu vaqtda band');
      throw e;
    }
  }

  private async load(id: string) {
    const a = await this.prisma.dockAppointment.findUnique({ where: { id }, include: APPT_INCLUDE });
    if (!a) throw new NotFoundException('Rampa yozuvi topilmadi');
    return a;
  }

  private isStaff(user: DockUser, hubId: string) {
    return user.role === Role.ADMIN || (user.role === Role.DISPATCHER && (!user.hubId || user.hubId === hubId));
  }

  async get(user: DockUser, id: string) {
    const a = await this.load(id);
    const staff = this.isStaff(user, a.hubId);
    if (!staff && a.bookedById !== user.id) throw new NotFoundException('Rampa yozuvi topilmadi');
    return this.full(a, staff);
  }

  // ---------- Holat o'zgarishlari ----------

  /** Bekor qilish: buyurtmachi (faqat kutilayotgan) yoki Hub xodimi (kelgan bo'lsa ham). Slot darhol bo'shaydi. */
  async cancel(user: DockUser, id: string, reason?: string) {
    const a = await this.load(id);
    const staff = this.isStaff(user, a.hubId);
    if (!staff && a.bookedById !== user.id) throw new NotFoundException('Rampa yozuvi topilmadi');
    const from: DockApptStatus[] = staff ? ACTIVE : [DockApptStatus.BOOKED];
    const r = await this.prisma.dockAppointment.updateMany({ where: { id, status: { in: from } }, data: { status: DockApptStatus.CANCELLED, slotLock: null, cancelReason: reason || (staff ? 'Hub bekor qildi' : 'Band qiluvchi bekor qildi') } });
    if (r.count === 0) throw new ConflictException("Bu yozuvni endi bekor qilib bo'lmaydi");
    return this.get(user, id);
  }

  private async transition(user: DockUser, id: string, from: DockApptStatus[], data: Prisma.DockAppointmentUpdateManyMutationInput, err: string) {
    const a = await this.load(id);
    this.assertStaff(user, a.hubId);
    const r = await this.prisma.dockAppointment.updateMany({ where: { id, status: { in: from } }, data });
    if (r.count === 0) throw new ConflictException(err);
    return this.get(user, id);
  }

  arrive(user: DockUser, id: string) {
    return this.transition(user, id, [DockApptStatus.BOOKED], { status: DockApptStatus.ARRIVED, arrivedAt: new Date() }, 'Yozuv holati o\'zgargan');
  }
  complete(user: DockUser, id: string) {
    return this.transition(user, id, ACTIVE, { status: DockApptStatus.DONE, slotLock: null, completedAt: new Date() }, 'Yozuv holati o\'zgargan');
  }
  noShow(user: DockUser, id: string) {
    return this.transition(user, id, [DockApptStatus.BOOKED], { status: DockApptStatus.NO_SHOW, slotLock: null }, 'Faqat kutilayotgan yozuvni «kelmadi» deb belgilash mumkin');
  }

  // ---------- Boshqa modullar uchun ----------

  /** Topshirish (intake) yakunlansa/rad etilsa/bekor bo'lsa rampa bo'shaydi */
  async closeForIntake(tx: Tx, intakeId: string, status: 'DONE' | 'CANCELLED', reason?: string) {
    await tx.dockAppointment.updateMany({
      where: { intakeId, slotLock: { not: null } },
      data: status === 'DONE' ? { status: DockApptStatus.DONE, slotLock: null, completedAt: new Date() } : { status: DockApptStatus.CANCELLED, slotLock: null, cancelReason: reason || 'Topshirish bekor qilindi' },
    });
  }

  /**
   * Kuryer buyurtmani olganda tegishli rampa yozuvini aniqlaydi: ko'rsatilgan bo'lsa — o'sha, aks holda hozirgi vaqtga mos keladigan o'ziniki.
   * Hub majburiy qilsa va yozuv bo'lmasa/vaqti kelmagan bo'lsa — 409. Yozuv "keldi" holatiga o'tadi.
   */
  async attachPickup(tx: Tx, p: { userId: string; hubId: string; appointmentId?: string; maxOrders: number }): Promise<string | null> {
    const hub = await tx.hub.findUniqueOrThrow({ where: { id: p.hubId }, select: { requireDockBooking: true } });
    const now = Date.now(), grace = this.env.DOCK_GRACE_MIN * 60_000;
    const inWindow = (a: { startsAt: Date; endsAt: Date }) => a.startsAt.getTime() - grace <= now && now <= a.endsAt.getTime() + grace;
    let appt: { id: string; startsAt: Date; endsAt: Date; status: DockApptStatus } | null = null;
    if (p.appointmentId) {
      appt = await tx.dockAppointment.findFirst({ where: { id: p.appointmentId, bookedById: p.userId, hubId: p.hubId, purpose: DockPurpose.PICKUP, status: { in: ACTIVE } } });
      if (!appt) throw new NotFoundException('Rampa yozuvi topilmadi yoki faol emas');
    } else {
      const mine = await tx.dockAppointment.findMany({ where: { bookedById: p.userId, hubId: p.hubId, purpose: DockPurpose.PICKUP, status: { in: ACTIVE } }, orderBy: { startsAt: 'asc' } });
      appt = mine.find(inWindow) ?? null;
    }
    if (hub.requireDockBooking) {
      if (!appt) throw new ConflictException("Bu Hub'dan yuk olish uchun avval rampa va vaqtni band qiling");
      if (!inWindow(appt)) throw new ConflictException(now < appt.startsAt.getTime() ? "Rampa vaqtingiz hali kelmadi. Belgilangan vaqtda keling" : "Rampa vaqtingiz o'tib ketgan. Yangi vaqt band qiling");
    }
    if (!appt) return null;
    const attached = await tx.localOrder.count({ where: { pickupApptId: appt.id } });
    if (attached >= p.maxOrders) throw new ConflictException(`Bitta rampa yozuvida ${p.maxOrders} tadan ortiq buyurtma olinmaydi`);
    if (appt.status === DockApptStatus.BOOKED) await tx.dockAppointment.updateMany({ where: { id: appt.id, status: DockApptStatus.BOOKED }, data: { status: DockApptStatus.ARRIVED, arrivedAt: new Date() } });
    return appt.id;
  }
}
