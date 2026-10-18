import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import QRCode from 'qrcode';
import { APP_ENV } from '../config/app-env.module';
import { AppEnv } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { C, MARGIN, dt, header, kg, newDoc, pageWidth, partyBoxes, rows, sectionTitle, securityBlock, som } from './pdf-layout';

export type DocKind = 'ttn' | 'receipt';

interface Viewer { id: string; role: Role; farmer?: { id: string } | null; market?: { id: string } | null; driver?: { id: string } | null }

const STATUS_UZ: Record<string, string> = {
  OPEN: 'Haydovchi kutilmoqda', ASSIGNED: 'Haydovchi biriktirilgan', LOADING: 'Yuklanmoqda', IN_TRANSIT: "Yo'lda", DELIVERED: 'Yetkazilgan', CANCELLED: 'Bekor qilingan',
};
const PAY_UZ: Record<string, string> = {
  PENDING: "To'lov kutilmoqda", HELD: "Escrow'da (ushlab turilibdi)", RELEASED: "Fermerga o'tkazilgan", REFUNDED: 'Qaytarilgan', CANCELLED: "Bekor qilingan",
};

const SHIPMENT_DOC_INCLUDE = {
  farmer: { include: { user: { select: { fullName: true, phone: true } } } },
  market: { include: { user: { select: { fullName: true, phone: true } } } },
  driver: { include: { user: { select: { fullName: true, phone: true } } } },
  booking: { include: { payment: true } },
  warehouseOrder: { include: { payment: true } },
} as const;

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService, @Inject(APP_ENV) private readonly env: AppEnv) {}

  /** HMAC imzo: hujjat identifikatori, og'irligi va summasi o'zgartirilsa kod mos kelmaydi */
  private sign(kind: DocKind, shipment: { id: string; weightKg: unknown }, amount: unknown) {
    const msg = [kind, shipment.id, Number(shipment.weightKg).toFixed(2), amount === null ? '' : Number(amount).toFixed(2)].join('|');
    return createHmac('sha256', this.env.JWT_SECRET).update('doc-v1:' + msg).digest('hex').slice(0, 20).toUpperCase();
  }
  private pretty = (code: string) => code.match(/.{1,5}/g)!.join('-');

  private async load(shipmentId: string) {
    const s = await this.prisma.shipment.findUnique({ where: { id: shipmentId }, include: SHIPMENT_DOC_INCLUDE });
    if (!s) throw new NotFoundException('Yuk topilmadi');
    const payment = s.booking?.payment ?? s.warehouseOrder?.payment ?? null;
    return { s, payment };
  }

  private assertAccess(viewer: Viewer, s: { farmerId: string; marketId: string; driverId: string | null }) {
    const ok = viewer.role === Role.ADMIN
      || (viewer.role === Role.FARMER && viewer.farmer?.id === s.farmerId)
      || (viewer.role === Role.MARKET && viewer.market?.id === s.marketId)
      || (viewer.role === Role.DRIVER && !!s.driverId && viewer.driver?.id === s.driverId);
    if (!ok) throw new ForbiddenException("Bu yuk hujjatiga kirish huquqingiz yo'q");
  }

  private async qr(kind: DocKind, id: string, code: string) {
    return QRCode.toBuffer(`AGRARGO|${kind.toUpperCase()}|${id}|${code}`, { margin: 1, width: 240, errorCorrectionLevel: 'M' });
  }

  private collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.end();
    });
  }

  /** Tovar-transport yukxati (TTN) */
  async ttn(viewer: Viewer, shipmentId: string): Promise<Buffer> {
    const { s, payment } = await this.load(shipmentId);
    this.assertAccess(viewer, s);
    const code = this.sign('ttn', s, payment?.amount ?? null);
    const no = s.id.slice(0, 8).toUpperCase();
    const doc = newDoc(`TTN ${no}`);
    header(doc, 'YUK XATI (TTN)', `№ ${no}  •  ${dt(s.createdAt)}`);

    sectionTitle(doc, 'Tomonlar');
    partyBoxes(doc, [
      { title: 'Yuboruvchi (Fermer)', lines: [s.farmer.farmName, s.farmer.user.fullName, s.farmer.user.phone, [s.originRegion, s.originDistrict].filter(Boolean).join(', '), s.originAddress ?? ''] },
      { title: 'Qabul qiluvchi (Market)', lines: [s.market.companyName, s.market.user.fullName, s.market.user.phone, [s.destRegion, s.destDistrict].filter(Boolean).join(', '), s.destAddress ?? ''] },
      { title: 'Tashuvchi (Haydovchi)', lines: s.driver
        ? [s.driver.user.fullName, s.driver.user.phone, `${s.driver.vehicleType}, ${s.driver.plateNumber}`, `Sig'im: ${kg(String(s.driver.capacityKg))}`]
        : ['Biriktirilmagan', 'Haydovchi hali tanlanmagan'] },
    ]);

    sectionTitle(doc, 'Yuk');
    rows(doc, [
      ['Yuk ID', s.id],
      ['Yuk turi', `${s.cargoName} (${s.category})`],
      ['Vazni', kg(String(s.weightKg))],
      ['Manba', s.bookingId ? 'Bron (fermerdan to\'g\'ridan-to\'g\'ri)' : 'Omborxona buyurtmasi'],
    ]);
    sectionTitle(doc, 'Marshrut');
    rows(doc, [
      ['Qayerdan', [s.originRegion, s.originDistrict, s.originAddress].filter(Boolean).join(', ')],
      ['Qayerga', [s.destRegion, s.destDistrict, s.destAddress].filter(Boolean).join(', ')],
      ['Holati', STATUS_UZ[s.status] ?? s.status],
      ['Haydovchi biriktirilgan', dt(s.assignedAt)],
      ['Yetkazilgan', dt(s.deliveredAt)],
    ]);
    sectionTitle(doc, "To'lov");
    rows(doc, [
      ['Yuk summasi', payment ? som(String(payment.amount)) : null],
      ["To'lov holati", payment ? PAY_UZ[payment.status] ?? payment.status : "To'lov hali boshlanmagan"],
    ]);

    // Imzolar
    doc.moveDown(0.8);
    const y = doc.y, w = pageWidth(doc) / 3;
    ['Yuboruvchi imzosi', 'Haydovchi imzosi', 'Qabul qiluvchi imzosi'].forEach((t, i) => {
      doc.moveTo(MARGIN + i * w + 6, y + 22).lineTo(MARGIN + (i + 1) * w - 14, y + 22).lineWidth(0.6).strokeColor(C.muted).stroke();
      doc.font('r').fontSize(8).fillColor(C.muted).text(t, MARGIN + i * w + 6, y + 26, { width: w - 20 });
    });
    doc.y = y + 44;
    securityBlock(doc, await this.qr('ttn', s.id, code), this.pretty(code), "QR-kodni skanerlang yoki kodni AgrarGo orqali tekshiring. Hujjat elektron shaklda shakllantirilgan; yuk og'irligi va summasi o'zgartirilsa kod mos kelmaydi.");
    return this.collect(doc);
  }

  /** To'lov cheki */
  async receipt(viewer: Viewer, shipmentId: string): Promise<Buffer> {
    const { s, payment } = await this.load(shipmentId);
    this.assertAccess(viewer, s);
    if (!payment) throw new NotFoundException("Bu yuk uchun to'lov hali boshlanmagan");
    const code = this.sign('receipt', s, payment.amount);
    const no = payment.id.slice(0, 8).toUpperCase();
    const doc = newDoc(`Chek ${no}`);
    header(doc, "TO'LOV CHEKI", `№ ${no}  •  ${dt(payment.createdAt)}`);

    sectionTitle(doc, "To'lov");
    rows(doc, [
      ["To'lov ID", payment.id],
      ['Summa', som(String(payment.amount))],
      ...(Number(payment.feeAmount) > 0 ? [['Omborxona xizmat haqi (summaga kiradi)', som(String(payment.feeAmount))] as [string, string]] : []),
      ['Holati', PAY_UZ[payment.status] ?? payment.status],
      ['Provayder', payment.provider + (payment.providerRef ? ` (${payment.providerRef})` : '')],
      ["Escrow'ga o'tgan", dt(payment.heldAt)],
      ["Fermerga o'tkazilgan", dt(payment.releasedAt)],
      ['Qaytarilgan', dt(payment.refundedAt)],
    ]);
    sectionTitle(doc, 'Tomonlar');
    partyBoxes(doc, [
      { title: "To'lovchi (Market)", lines: [s.market.companyName, s.market.user.fullName, s.market.user.phone] },
      { title: 'Oluvchi (Fermer)', lines: [s.farmer.farmName, s.farmer.user.fullName, s.farmer.user.phone] },
    ]);
    sectionTitle(doc, 'Yuk');
    rows(doc, [
      ['Yuk ID', s.id],
      ['Mahsulot', `${s.cargoName} (${s.category})`],
      ['Vazni', kg(String(s.weightKg))],
      ['Marshrut', `${s.originRegion}, ${s.originDistrict} → ${s.destRegion}, ${s.destDistrict}`],
    ]);
    securityBlock(doc, await this.qr('receipt', s.id, code), this.pretty(code), "Bu chek AgrarGo tomonidan avtomatik shakllantirilgan. QR-kod yoki kod orqali haqiqiyligini tekshirish mumkin.");
    return this.collect(doc);
  }

  /** Ommaviy tekshiruv: faqat kod to'g'rimi va yukning qisqa ma'lumoti (shaxsiy ma'lumotlarsiz) */
  async verify(kind: DocKind, shipmentId: string, rawCode: string) {
    const s = await this.prisma.shipment.findUnique({ where: { id: shipmentId }, include: { booking: { include: { payment: true } }, warehouseOrder: { include: { payment: true } } } });
    if (!s) return { valid: false };
    const payment = s.booking?.payment ?? s.warehouseOrder?.payment ?? null;
    const expected = Buffer.from(this.sign(kind, s, payment?.amount ?? null));
    const given = Buffer.from(rawCode.replace(/-/g, '').toUpperCase());
    const valid = expected.length === given.length && timingSafeEqual(expected, given);
    if (!valid) return { valid: false };
    return { valid: true, kind, cargoName: s.cargoName, weightKg: Number(s.weightKg), status: s.status, issuedAt: s.createdAt };
  }
}
