import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { roleTakenMessage } from '../common/role-labels';
import { PrismaService } from '../prisma/prisma.service';
import { publicUser } from '../common/public-user';
import { ProfileService } from '../profile/profile.service';
import { Actor, AuditService } from './audit.service';
import { AuditQuery, CreateStaffDto, ProductsQuery, ShipmentsQuery, UpdateProductDto, UsersQuery } from './dto/admin.dto';

const D = (n: number | string) => new Prisma.Decimal(n);
const DAY = 86_400_000;
const BCRYPT_ROUNDS = 10;

const USER_LIST_INCLUDE = {
  farmer: { select: { farmName: true, region: true } },
  driver: { select: { plateNumber: true, region: true } },
  market: { select: { companyName: true, region: true } },
} satisfies Prisma.UserInclude;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly profiles: ProfileService,
  ) {}

  // ================= Statistika =================

  async stats() {
    const since = new Date(Date.now() - 13 * DAY);
    const [users, usersActive, products, bookings, shipments, payments, whByZone, whItems, whOrders, units, signups, lastAudit] = await Promise.all([
      this.prisma.user.groupBy({ by: ['role'], _count: true }),
      this.prisma.user.groupBy({ by: ['role', 'isActive'], _count: true }),
      this.prisma.product.groupBy({ by: ['status'], _count: true }),
      this.prisma.booking.groupBy({ by: ['status'], _count: true }),
      this.prisma.shipment.groupBy({ by: ['status'], _count: true }),
      this.prisma.payment.groupBy({ by: ['status'], _count: true, _sum: { amount: true } }),
      this.prisma.warehouseItem.groupBy({ by: ['zone'], _count: true, _sum: { weightKg: true, reservedKg: true }, where: { status: 'ACTIVE' } }),
      this.prisma.warehouseItem.groupBy({ by: ['status'], _count: true }),
      this.prisma.warehouseOrder.groupBy({ by: ['status'], _count: true, _sum: { totalPrice: true } }),
      this.prisma.storageUnit.count(),
      this.prisma.$queryRaw<{ d: string; role: Role; c: bigint }[]>`
        SELECT to_char(("createdAt" AT TIME ZONE 'Asia/Tashkent')::date, 'YYYY-MM-DD') AS d, role, count(*) AS c
        FROM "User" WHERE "createdAt" >= ${since} GROUP BY 1, 2`,
      this.prisma.auditLog.count({ where: { createdAt: { gte: new Date(Date.now() - DAY) } } }),
    ]);

    const zero = D(0);
    const counts = <T extends { _count: number }>(rows: T[], key: keyof T) => Object.fromEntries(rows.map((r) => [String(r[key]), r._count]));
    const days: { date: string; farmers: number; markets: number; drivers: number; total: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const date = new Date(Date.now() + 5 * 3600_000 - i * DAY).toISOString().slice(0, 10); // Toshkent kuni
      const rows = signups.filter((s) => s.d === date);
      const n = (role: Role) => Number(rows.find((r) => r.role === role)?.c ?? 0);
      days.push({ date, farmers: n('FARMER'), markets: n('MARKET'), drivers: n('DRIVER'), total: rows.reduce((a, r) => a + Number(r.c), 0) });
    }
    const pay = (s: string) => payments.find((p) => p.status === s);
    return {
      users: {
        total: users.reduce((a, r) => a + r._count, 0),
        byRole: counts(users, 'role'),
        blocked: usersActive.filter((r) => !r.isActive).reduce((a, r) => a + r._count, 0),
      },
      products: counts(products, 'status'),
      bookings: counts(bookings, 'status'),
      shipments: counts(shipments, 'status'),
      payments: {
        byStatus: Object.fromEntries(payments.map((p) => [p.status, { count: p._count, amount: p._sum.amount ?? zero }])),
        // Platforma aylanmasi: escrow'da turgan + fermerga o'tkazilgan mablag'
        volume: (pay('HELD')?._sum.amount ?? zero).add(pay('RELEASED')?._sum.amount ?? zero),
        heldAmount: pay('HELD')?._sum.amount ?? zero,
      },
      warehouse: {
        units,
        totalKg: whByZone.reduce((a, r) => a.add(r._sum.weightKg ?? zero), zero),
        byZone: whByZone.map((r) => ({ zone: r.zone, itemCount: r._count, weightKg: r._sum.weightKg ?? zero, reservedKg: r._sum.reservedKg ?? zero })),
        itemsByStatus: counts(whItems, 'status'),
        ordersByStatus: Object.fromEntries(whOrders.map((r) => [r.status, { count: r._count, amount: r._sum.totalPrice ?? zero }])),
      },
      signups: days,
      auditLast24h: lastAudit,
    };
  }

  // ================= Foydalanuvchilar =================

  async listUsers(q: UsersQuery) {
    const where: Prisma.UserWhereInput = {
      ...(q.role && { role: q.role }),
      ...(q.active && { isActive: q.active === 'true' }),
      ...(q.q && {
        OR: [
          { fullName: { contains: q.q, mode: 'insensitive' } },
          { phone: { contains: q.q.replace(/\s/g, '') } },
          { farmer: { farmName: { contains: q.q, mode: 'insensitive' } } },
          { market: { companyName: { contains: q.q, mode: 'insensitive' } } },
          { driver: { plateNumber: { contains: q.q.replace(/[\s-]/g, '').toUpperCase() } } },
        ],
      }),
    };
    const limit = q.limit ?? 20;
    const page = q.page ?? 1;
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, include: USER_LIST_INCLUDE }),
    ]);
    return { items: rows.map((u) => this.userView(u)), total, page, pages: Math.max(1, Math.ceil(total / limit)) };
  }

  async getUser(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, include: { farmer: true, driver: true, market: true } });
    if (!u) throw new NotFoundException('Foydalanuvchi topilmadi');
    const [products, bookings, shipments, whItems, whOrders] = await Promise.all([
      u.farmer ? this.prisma.product.count({ where: { farmerId: u.farmer.id } }) : 0,
      u.market ? this.prisma.booking.count({ where: { marketId: u.market.id } }) : u.farmer ? this.prisma.booking.count({ where: { product: { farmerId: u.farmer.id } } }) : 0,
      u.driver ? this.prisma.shipment.count({ where: { driverId: u.driver.id } }) : 0,
      u.farmer ? this.prisma.warehouseItem.count({ where: { farmerId: u.farmer.id } }) : 0,
      u.market ? this.prisma.warehouseOrder.count({ where: { marketId: u.market.id } }) : u.driver ? this.prisma.warehouseOrder.count({ where: { driverId: u.driver.id } }) : 0,
    ]);
    const safe = publicUser(u);
    return { ...safe, counts: { products, bookings, shipments, warehouseItems: whItems, warehouseOrders: whOrders } };
  }

  /** Profil ma'lumotlarini tahrirlash: foydalanuvchining o'zi uchun qo'llaniladigan validatsiya bilan bir xil. */
  async updateUser(actor: Actor, id: string, body: unknown) {
    const target = await this.prisma.user.findUnique({ where: { id }, select: { role: true, fullName: true } });
    if (!target) throw new NotFoundException('Foydalanuvchi topilmadi');
    if (target.role === Role.ADMIN || target.role === Role.DISPATCHER) {
      const name = typeof (body as any)?.fullName === 'string' ? (body as any).fullName.trim() : '';
      if (name.length < 2 || name.length > 100) throw new BadRequestException("Ism va familiya 2-100 ta belgidan iborat bo'lishi kerak");
      await this.prisma.user.update({ where: { id }, data: { fullName: name } });
    } else {
      await this.profiles.update(id, target.role, body);
    }
    await this.audit.log(actor, 'user.update', 'user', id, { fields: Object.keys((body as object) ?? {}) });
    return this.getUser(id);
  }

  /** Bloklash/faollashtirish. Bloklanganda barcha sessiyalar darhol yopiladi (tokenVersion). */
  async setStatus(actor: Actor, id: string, isActive: boolean, reason?: string) {
    const target = await this.prisma.user.findUnique({ where: { id }, select: { role: true, isActive: true } });
    if (!target) throw new NotFoundException('Foydalanuvchi topilmadi');
    if (!isActive) {
      if (id === actor.id) throw new ConflictException("O'zingizni bloklab bo'lmaydi");
      if (target.role === Role.ADMIN && target.isActive) {
        const otherAdmins = await this.prisma.user.count({ where: { role: Role.ADMIN, isActive: true, id: { not: id } } });
        if (otherAdmins === 0) throw new ConflictException("Oxirgi faol administratorni bloklab bo'lmaydi");
      }
    }
    await this.prisma.user.update({ where: { id }, data: { isActive, ...(!isActive && { tokenVersion: { increment: 1 } }) } });
    await this.audit.log(actor, isActive ? 'user.activate' : 'user.block', 'user', id, reason ? { reason } : undefined);
    return this.getUser(id);
  }

  async setPassword(actor: Actor, id: string, password: string) {
    const exists = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Foydalanuvchi topilmadi');
    await this.prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS), tokenVersion: { increment: 1 } } });
    await this.audit.log(actor, 'user.password_reset', 'user', id);
    return { updated: true };
  }

  async createStaff(actor: Actor, dto: CreateStaffDto) {
    const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone }, select: { role: true } });
    if (existing) throw new ConflictException(roleTakenMessage(existing.role));
    try {
      const u = await this.prisma.user.create({
        data: { phone: dto.phone, fullName: dto.fullName, role: dto.role, passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS) },
        include: USER_LIST_INCLUDE,
      });
      await this.audit.log(actor, 'staff.create', 'user', u.id, { role: dto.role });
      return this.userView(u);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException("Bu telefon raqam allaqachon ro'yxatdan o'tgan");
      throw e;
    }
  }

  // ================= E'lonlar =================

  async listProducts(q: ProductsQuery) {
    const where: Prisma.ProductWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.q && { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { farmer: { farmName: { contains: q.q, mode: 'insensitive' } } }] }),
    };
    const limit = q.limit ?? 20;
    const page = q.page ?? 1;
    const [total, rows] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
        include: { farmer: { select: { farmName: true, region: true, user: { select: { id: true, fullName: true, phone: true, isActive: true } } } }, _count: { select: { bookings: true } } },
      }),
    ]);
    return {
      items: rows.map((p) => ({
        id: p.id, name: p.name, category: p.category, quantityKg: p.quantityKg, pricePerKg: p.pricePerKg, status: p.status,
        description: p.description, createdAt: p.createdAt, bookingCount: p._count.bookings,
        farmer: { farmName: p.farmer.farmName, region: p.farmer.region, userId: p.farmer.user.id, fullName: p.farmer.user.fullName, phone: p.farmer.user.phone, isActive: p.farmer.user.isActive },
      })),
      total, page, pages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async updateProduct(actor: Actor, id: string, dto: UpdateProductDto) {
    const data: Prisma.ProductUpdateInput = {};
    for (const k of ['name', 'category', 'quantityKg', 'pricePerKg', 'status', 'description'] as const) if (dto[k] !== undefined) (data as any)[k] = dto[k];
    if (Object.keys(data).length === 0) throw new BadRequestException("Kamida bitta maydonni yuboring");
    try {
      await this.prisma.product.update({ where: { id }, data });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') throw new NotFoundException("E'lon topilmadi");
      throw e;
    }
    await this.audit.log(actor, 'product.update', 'product', id, { fields: Object.keys(data) });
    return { updated: true };
  }

  async deleteProduct(actor: Actor, id: string) {
    try {
      await this.prisma.product.delete({ where: { id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2025') throw new NotFoundException("E'lon topilmadi");
        if (e.code === 'P2003') throw new ConflictException("Bu e'lon bo'yicha bronlar bor: o'chirib bo'lmaydi. Statusni SOLD qilib arxivlang");
      }
      throw e;
    }
    await this.audit.log(actor, 'product.delete', 'product', id);
    return { deleted: true };
  }

  // ================= Yuk tashish =================

  async listShipments(q: ShipmentsQuery) {
    const where: Prisma.ShipmentWhereInput = q.status ? { status: q.status } : {};
    const limit = q.limit ?? 20;
    const page = q.page ?? 1;
    const [total, rows] = await Promise.all([
      this.prisma.shipment.count({ where }),
      this.prisma.shipment.findMany({
        where, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * limit, take: limit,
        include: {
          driver: { select: { plateNumber: true, vehicleType: true, user: { select: { fullName: true, phone: true } } } },
          booking: { select: { payment: { select: { status: true, amount: true } } } },
          warehouseOrder: { select: { payment: { select: { status: true, amount: true } } } },
          farmer: { select: { farmName: true } },
          market: { select: { companyName: true } },
        },
      }),
    ]);
    return {
      items: rows.map((s) => ({
        id: s.id, status: s.status, cargoName: s.cargoName, category: s.category, weightKg: s.weightKg,
        origin: { region: s.originRegion, district: s.originDistrict }, destination: { region: s.destRegion, district: s.destDistrict },
        createdAt: s.createdAt, deliveredAt: s.deliveredAt, lastLocationAt: s.lastLocationAt,
        source: s.warehouseOrderId ? 'WAREHOUSE' : 'BOOKING',
        farmName: s.farmer.farmName, companyName: s.market.companyName,
        paymentStatus: (s.booking?.payment ?? s.warehouseOrder?.payment)?.status ?? null, amount: (s.booking?.payment ?? s.warehouseOrder?.payment)?.amount ?? null,
        driver: s.driver ? { fullName: s.driver.user.fullName, phone: s.driver.user.phone, plateNumber: s.driver.plateNumber, vehicleType: s.driver.vehicleType } : null,
      })),
      total, page, pages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // ================= Audit =================

  async listAudit(q: AuditQuery) {
    const where: Prisma.AuditLogWhereInput = q.entity ? { entity: q.entity } : {};
    const limit = q.limit ?? 30;
    const page = q.page ?? 1;
    const [total, items] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    ]);
    return { items, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
  }

  private userView(u: Prisma.UserGetPayload<{ include: typeof USER_LIST_INCLUDE }>) {
    return {
      id: u.id, phone: u.phone, fullName: u.fullName, role: u.role, isActive: u.isActive, createdAt: u.createdAt, avatarUrl: u.avatarUrl,
      org: u.farmer?.farmName ?? u.market?.companyName ?? u.driver?.plateNumber ?? null,
      region: u.farmer?.region ?? u.market?.region ?? u.driver?.region ?? null,
    };
  }
}
