import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import QRCode from 'qrcode';
import { APP_ENV } from '../config/app-env.module';
import { AppEnv } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { paymentBreakdown } from '../pricing/pricing';
import { BolData, BolParty, Payer, bolNumber, escrowStamp, incotermOf, packagingFor, renderBol, signatureOf } from './bol-layout';
import { C, Lang, MARGIN, dt, header, kg, newDoc, pageWidth, partyBoxes, rows, sectionTitle, securityBlock, som, tl } from './pdf-layout';

export type DocKind = 'ttn' | 'receipt' | 'bol';

interface Viewer { id: string; role: Role; farmer?: { id: string } | null; market?: { id: string } | null; driver?: { id: string } | null }

const STATUS_UZ: Record<string, string> = {
  OPEN: 'Haydovchi kutilmoqda', ASSIGNED: 'Haydovchi biriktirilgan', LOADING: 'Yuklanmoqda', IN_TRANSIT: "Yo'lda", DELIVERED: 'Yetkazilgan', CANCELLED: 'Bekor qilingan',
};
const PAY_UZ: Record<string, string> = {
  PENDING: "To'lov kutilmoqda", HELD: "Escrow'da (ushlab turilibdi)", RELEASED: "Fermerga o'tkazilgan", REFUNDED: 'Qaytarilgan', CANCELLED: "Bekor qilingan",
};

const STATUS_RU: Record<string, string> = {
  OPEN: 'Ожидается водитель', ASSIGNED: 'Водитель назначен', LOADING: 'Погрузка', IN_TRANSIT: 'В пути', DELIVERED: 'Доставлено', CANCELLED: 'Отменено',
};
const STATUS_EN: Record<string, string> = {
  OPEN: 'Awaiting driver', ASSIGNED: 'Driver assigned', LOADING: 'Loading', IN_TRANSIT: 'In transit', DELIVERED: 'Delivered', CANCELLED: 'Cancelled',
};
const PAY_RU: Record<string, string> = { PENDING: 'Ожидает оплаты', HELD: 'В эскроу (удерживается)', RELEASED: 'Переведено фермеру', REFUNDED: 'Возвращено', CANCELLED: 'Отменено' };
const PAY_EN: Record<string, string> = { PENDING: 'Awaiting payment', HELD: 'Held in escrow', RELEASED: 'Released to farmer', REFUNDED: 'Refunded', CANCELLED: 'Cancelled' };

const SHIPMENT_DOC_INCLUDE = {
  farmer: { include: { user: { select: { fullName: true, phone: true } } } },
  market: { include: { user: { select: { fullName: true, phone: true } } } },
  driver: { include: { user: { select: { fullName: true, phone: true } } } },
  booking: { include: { payment: true } },
  warehouseOrder: { include: { payment: true } },
  events: { orderBy: { createdAt: 'asc' as const } },
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
    const ok = viewer.role === Role.ADMIN || viewer.role === Role.DISPATCHER
      || (viewer.role === Role.FARMER && viewer.farmer?.id === s.farmerId)
      || (viewer.role === Role.MARKET && viewer.market?.id === s.marketId)
      || (viewer.role === Role.DRIVER && !!s.driverId && viewer.driver?.id === s.driverId);
    if (!ok) throw new ForbiddenException("Bu yuk hujjatiga kirish huquqingiz yo'q");
  }

  /** QR-kod ommaviy havolani kodlaydi: telefon kamerasi skanerlasa brauzerda to'g'ridan-to'g'ri hujjat ochiladi */
  private async qr(kind: DocKind, id: string, code: string) {
    const base = (process.env.PUBLIC_API_URL || 'https://agrargo-backend.onrender.com').replace(/\/$/, '');
    return QRCode.toBuffer(`${base}/documents/verify/${kind}/${id}/${code}`, { margin: 1, width: 240, errorCorrectionLevel: 'M' });
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
  async ttn(viewer: Viewer, shipmentId: string, lang: Lang = 'uz'): Promise<Buffer> {
    const { s, payment } = await this.load(shipmentId);
    this.assertAccess(viewer, s);
    const code = this.sign('ttn', s, payment?.amount ?? null);
    const no = s.id.slice(0, 8).toUpperCase();
    const doc = newDoc(`TTN ${no}`, lang);
    const t = (uz: string, ru: string, en: string) => tl(doc, uz, ru, en);
    const st = (x: string) => (lang === 'uz' ? STATUS_UZ[x] : lang === 'ru' ? STATUS_RU[x] : STATUS_EN[x]) ?? x;
    const ps = (x: string) => (lang === 'uz' ? PAY_UZ[x] : lang === 'ru' ? PAY_RU[x] : PAY_EN[x]) ?? x;
    header(doc, t('YUK XATI (TTN)', 'ТОВАРНО-ТРАНСПОРТНАЯ НАКЛАДНАЯ (ТТН)', 'CONSIGNMENT NOTE (TTN)'), `№ ${no}  •  ${dt(s.createdAt)}`);

    sectionTitle(doc, t('Tomonlar', 'Стороны', 'Parties'));
    partyBoxes(doc, [
      { title: t('Yuboruvchi (Fermer)', 'Отправитель (фермер)', 'Shipper (Farmer)'), lines: [s.farmer.farmName, s.farmer.user.fullName, s.farmer.user.phone, [s.originRegion, s.originDistrict].filter(Boolean).join(', '), s.originAddress ?? ''] },
      { title: t('Qabul qiluvchi (Market)', 'Получатель (магазин)', 'Consignee (Market)'), lines: [s.market.companyName, s.market.user.fullName, s.market.user.phone, [s.destRegion, s.destDistrict].filter(Boolean).join(', '), s.destAddress ?? ''] },
      { title: t('Tashuvchi (Haydovchi)', 'Перевозчик (водитель)', 'Carrier (Driver)'), lines: s.driver
        ? [s.driver.user.fullName, s.driver.user.phone, `${s.driver.vehicleType}, ${s.driver.plateNumber}`, `${t("Sig'im", 'Вместимость', 'Capacity')}: ${kg(String(s.driver.capacityKg))}`]
        : [t('Biriktirilmagan', 'Не назначен', 'Not assigned'), t('Haydovchi hali tanlanmagan', 'Водитель ещё не выбран', 'No driver selected yet')] },
    ]);

    sectionTitle(doc, t('Yuk', 'Груз', 'Cargo'));
    rows(doc, [
      [t('Yuk ID', 'ID груза', 'Cargo ID'), s.id],
      [t('Yuk turi', 'Вид груза', 'Cargo type'), `${s.cargoName} (${s.category})`],
      [t('Vazni', 'Вес', 'Weight'), kg(String(s.weightKg))],
      [t('Manba', 'Источник', 'Source'), s.bookingId ? t("Bron (fermerdan to'g'ridan-to'g'ri)", 'Бронь (напрямую от фермера)', 'Booking (direct from farmer)') : t('Omborxona buyurtmasi', 'Заказ со склада', 'Warehouse order')],
    ]);
    sectionTitle(doc, t('Marshrut', 'Маршрут', 'Route'));
    rows(doc, [
      [t('Qayerdan', 'Откуда', 'From'), [s.originRegion, s.originDistrict, s.originAddress].filter(Boolean).join(', ')],
      [t('Qayerga', 'Куда', 'To'), [s.destRegion, s.destDistrict, s.destAddress].filter(Boolean).join(', ')],
      [t('Holati', 'Статус', 'Status'), st(s.status)],
      [t('Haydovchi biriktirilgan', 'Водитель назначен', 'Driver assigned'), dt(s.assignedAt)],
      [t('Yetkazilgan', 'Доставлено', 'Delivered'), dt(s.deliveredAt)],
    ]);
    sectionTitle(doc, t("To'lov", 'Оплата', 'Payment'));
    rows(doc, [
      [t('Mahsulot summasi (fermerga)', 'Стоимость товара (фермеру)', 'Product amount (to farmer)'), payment ? som(String(payment.amount)) : null],
      ...(payment && Number(payment.deliveryFee) > 0 ? [
        [t('Yetkazib berish haqi (haydovchiga)', 'Стоимость доставки (водителю)', 'Delivery fee (to driver)'), som(String(payment.deliveryFee))] as [string, string],
        [t('Xizmat haqi (platforma)', 'Сервисный сбор (платформа)', 'Service fee (platform)'), som(String(payment.serviceFee))] as [string, string],
        [t("Jami (market to'laydi)", 'Итого (платит магазин)', 'Total (paid by market)'), som(String(Number(payment.amount) + Number(payment.deliveryFee) + Number(payment.serviceFee)))] as [string, string],
      ] : []),
      [t("To'lov holati", 'Статус оплаты', 'Payment status'), payment ? ps(payment.status) : t("To'lov hali boshlanmagan", 'Оплата ещё не начата', 'Payment not started')],
    ]);

    // Imzolar
    doc.moveDown(0.8);
    const y = doc.y, w = pageWidth(doc) / 3;
    [t('Yuboruvchi imzosi', 'Подпись отправителя', 'Shipper signature'), t('Haydovchi imzosi', 'Подпись водителя', 'Driver signature'), t('Qabul qiluvchi imzosi', 'Подпись получателя', 'Consignee signature')].forEach((t, i) => {
      doc.moveTo(MARGIN + i * w + 6, y + 22).lineTo(MARGIN + (i + 1) * w - 14, y + 22).lineWidth(0.6).strokeColor(C.muted).stroke();
      doc.font('r').fontSize(8).fillColor(C.muted).text(t, MARGIN + i * w + 6, y + 26, { width: w - 20 });
    });
    doc.y = y + 44;
    securityBlock(doc, await this.qr('ttn', s.id, code), this.pretty(code), t("QR-kodni skanerlang yoki kodni AgrarGo orqali tekshiring. Hujjat elektron shaklda shakllantirilgan; yuk og'irligi va summasi o'zgartirilsa kod mos kelmaydi.", 'Отсканируйте QR-код или проверьте код в AgrarGo. Документ сформирован в электронном виде; при изменении веса или суммы код перестанет совпадать.', 'Scan the QR code or verify the code in AgrarGo. The document is generated electronically; the code will not match if weight or amount is altered.'));
    return this.collect(doc);
  }

  /**
   * Bill of Lading & Invoice (Amerika B2B BOL shakli). `id` — yuk (shipment) yoki buyurtma (bron / ombor buyurtmasi) identifikatori.
   * Hujjat har safar joriy ma'lumotlardan shakllanadi (bron tasdiqlangandan boshlab mavjud; «Yetkazildi» dan keyin PIN imzolari va to'lov holati bilan to'liq).
   */
  private async loadBolShipment(id: string) {
    return (await this.prisma.shipment.findUnique({ where: { id }, include: SHIPMENT_DOC_INCLUDE }))
      ?? (await this.prisma.shipment.findFirst({ where: { OR: [{ bookingId: id }, { warehouseOrderId: id }] }, include: SHIPMENT_DOC_INCLUDE }));
  }

  async bol(viewer: Viewer, id: string, lang: Lang = 'en'): Promise<Buffer> {
    const s = await this.loadBolShipment(id);
    if (!s) throw new NotFoundException('Buyurtma yoki yuk topilmadi');
    this.assertAccess(viewer, s);
    return this.renderBolPdf(s, lang);
  }

  /** QR-kod orqali ochiq havola: HMAC kod to'g'ri bo'lsa rasmiy BOL PDF qaytariladi, aks holda null */
  async publicBol(shipmentId: string, rawCode: string, lang: Lang = 'en'): Promise<Buffer | null> {
    const s = await this.prisma.shipment.findUnique({ where: { id: shipmentId }, include: SHIPMENT_DOC_INCLUDE });
    if (!s) return null;
    const payment = s.booking?.payment ?? s.warehouseOrder?.payment ?? null;
    const expected = Buffer.from(this.sign('bol', s, payment?.amount ?? null));
    const given = Buffer.from(rawCode.replace(/-/g, '').toUpperCase());
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    return this.renderBolPdf(s, lang);
  }

  private async renderBolPdf(s: NonNullable<Awaited<ReturnType<DocumentsService['loadBolShipment']>>>, lang: Lang): Promise<Buffer> {
    const L = (uz: string, ru: string, en: string) => (lang === 'uz' ? uz : lang === 'ru' ? ru : en);
    const payment = s.booking?.payment ?? s.warehouseOrder?.payment ?? null;
    const code = this.sign('bol', s, payment?.amount ?? null);
    const when = s.createdAt;
    const payer: Payer = (payment?.deliveryPayer ?? 'BUYER') as Payer;
    const inc = incotermOf(payer, lang === 'en' ? 'bi' : lang);
    const weight = Number(s.weightKg);
    const pk = packagingFor(s.category, weight);
    const unit = Number(s.booking?.pricePerKg ?? s.warehouseOrder?.pricePerKg ?? 0);
    const bd = payment ? paymentBreakdown({ productPrice: payment.amount, deliveryFee: payment.deliveryFee, serviceFee: payment.serviceFee, distanceKm: payment.distanceKm, deliveryPayer: payment.deliveryPayer }) : null;
    const product = bd ? bd.productPrice : weight * unit;
    const freight = bd ? bd.deliveryFee : 0, service = bd ? bd.serviceFee : 0;
    const total = bd ? bd.totalPrice : product;
    const party = (name: string, user: { fullName: string; phone: string }, region: string, district: string, address: string | null, stir: string | null): BolParty =>
      ({ name, address: address ?? '—', cityStateZip: [district, region].filter(Boolean).join(', '), phone: user.phone, stir, contact: user.fullName });
    const shipFrom = party(`${s.farmer.farmName} (${s.farmer.user.fullName})`, s.farmer.user, s.originRegion, s.originDistrict, s.originAddress ?? s.farmer.address, s.farmer.stir);
    const shipTo = party(`${s.market.companyName} (${s.market.user.fullName})`, s.market.user, s.destRegion, s.destDistrict, s.destAddress ?? s.market.address, s.market.stir);
    const eventAt = (st: string) => s.events.find((e) => e.status === st)?.createdAt ?? null;
    const orderRef = s.bookingId ? `BK-${s.bookingId.slice(0, 8).toUpperCase()}` : s.warehouseOrderId ? `WH-${s.warehouseOrderId.slice(0, 8).toUpperCase()}` : '—';
    const data: BolData = {
      bolNumber: bolNumber(s.bolNo, when),
      printDate: new Date(), issuedAt: when, verifyCode: this.pretty(code), qr: await this.qr('bol', s.id, code),
      shipFrom, shipTo, billTo: { ...shipTo, name: s.market.companyName },
      billingInstructions: payment
        ? L(
          `AgrarGo Escrow orqali to'lov (${payment.provider}). Escrow holati: ${(PAY_UZ[payment.status] ?? payment.status)}. ${payer === 'FARMER' ? "Yo'l haqi fermer oladigan summadan ushlanadi; xaridor mahsulot + xizmat haqini to'laydi." : "Xaridor mahsulot + yo'l haqi + xizmat haqini to'laydi."}`,
          `Оплата через эскроу AgrarGo (${payment.provider}). Статус эскроу: ${(PAY_RU[payment.status] ?? payment.status)}. ${payer === 'FARMER' ? 'Стоимость доставки удерживается из выплаты фермеру; покупатель оплачивает товар + сервисный сбор.' : 'Покупатель оплачивает товар + доставку + сервисный сбор.'}`,
          `Pay via AgrarGo Escrow (${payment.provider}). Escrow: ${payment.status}. ${payer === 'FARMER' ? "Freight is deducted from the farmer's proceeds; buyer pays product + service fee." : 'Buyer pays product + freight + service fee.'}`)
        : L("To'lov hali boshlanmagan.", 'Оплата ещё не начата.', 'Payment has not been initiated yet.'),
      carrier: s.driver
        ? { name: s.driver.user.fullName, license: s.driver.licenseNumber, vehicle: s.driver.vehicleType, plate: s.driver.plateNumber, phone: s.driver.user.phone }
        : { name: L('Biriktirilmagan', 'Не назначен', 'Not assigned yet / Biriktirilmagan'), license: null, vehicle: '—', plate: '—', phone: '—' },
      ids: { shipmentId: s.id.slice(0, 8).toUpperCase(), orderRef, pickupAt: eventAt('IN_TRANSIT'), deliveredAt: s.deliveredAt, status: (lang === 'ru' ? STATUS_RU : lang === 'uz' ? STATUS_UZ : STATUS_UZ)[s.status] ?? s.status, source: s.bookingId ? L('B2B bron', 'B2B-бронь', 'B2B booking') : L('Omborxona buyurtmasi', 'Заказ со склада', 'Warehouse order'), custRef: s.id },
      incoterm: { code: inc.code, label: inc.label, payer, terms: inc.terms },
      instructions: [
        L(`Marshrut: ${s.originRegion}, ${s.originDistrict} → ${s.destRegion}, ${s.destDistrict}${payment?.distanceKm ? ` (${payment.distanceKm} km)` : ''}.`, `Маршрут: ${s.originRegion}, ${s.originDistrict} → ${s.destRegion}, ${s.destDistrict}${payment?.distanceKm ? ` (${payment.distanceKm} км)` : ''}.`, `Route: ${s.originRegion}, ${s.originDistrict} → ${s.destRegion}, ${s.destDistrict}${payment?.distanceKm ? ` (${payment.distanceKm} km)` : ''}.`),
        L("PIN-kod: yuklashda PIN'ni fermer, topshirishda haydovchi kiritadi — ikkalasi ham elektron imzo hisoblanadi.", 'PIN-код: при погрузке PIN вводит фермер, при доставке — водитель; оба служат электронной подписью.', 'Delivery PIN: pickup PIN is entered by the shipper, delivery PIN by the carrier — both act as e-signatures.'),
        L(`Qadoqlar soni toifaning standart qadog'idan hisoblangan (${pk.type}${pk.unitKg < 1000 ? ', ' + pk.unitKg + ' kg' : ''}).`, `Количество мест рассчитано по стандартной упаковке категории (${pk.type}${pk.unitKg < 1000 ? ', ' + pk.unitKg + ' кг' : ''}).`, `Package count is estimated from the standard pack size of the category (${pk.type}${pk.unitKg < 1000 ? ', ' + pk.unitKg + ' kg' : ''}).`),
      ],
      summary: { packages: pk.qty, totalWeightKg: weight, commodity: s.cargoName, category: s.category },
      items: [{ orderNo: orderRef, itemNo: (s.bookingId ?? s.warehouseOrderId ?? s.id).slice(0, 8).toUpperCase(), qty: pk.qty, uom: pk.uom, packageType: pk.type, description: `${s.cargoName} — ${Number(weight).toLocaleString('ru-RU')} kg`, unitPrice: unit || (weight ? product / weight : 0), amount: product }],
      totals: { product, freight, service, total, farmerNet: payer === 'FARMER' && bd ? Number(payment!.amount) : null, freightPaidBy: payer === 'FARMER' ? L("Fermer (oldindan)", 'Фермер (предоплата)', 'Farmer (Prepaid)') : L("Xaridor (qabulda)", 'Покупатель (при получении)', 'Buyer (Collect)') },
      escrow: escrowStamp(payment?.status, lang === 'en' ? 'bi' : lang),
      signatures: {
        shipper: signatureOf(s.farmer.user.fullName, s.pickupPinVerifiedAt, eventAt('IN_TRANSIT'), 'CONFIRMED (status)'),
        carrier: signatureOf(s.driver?.user.fullName ?? '—', s.pickupPinVerifiedAt, eventAt('LOADING'), 'ASSIGNED (status)'),
        consignee: signatureOf(s.market.user.fullName, s.deliveryPinVerifiedAt, s.deliveredAt, 'CONFIRMED (status)'),
      },
    };
    const doc = newDoc(`BOL ${data.bolNumber}`, lang);
    renderBol(doc, data);
    return this.collect(doc);
  }

  /** To'lov cheki */
  async receipt(viewer: Viewer, shipmentId: string, lang: Lang = 'uz'): Promise<Buffer> {
    const { s, payment } = await this.load(shipmentId);
    this.assertAccess(viewer, s);
    if (!payment) throw new NotFoundException("Bu yuk uchun to'lov hali boshlanmagan");
    const code = this.sign('receipt', s, payment.amount);
    const no = payment.id.slice(0, 8).toUpperCase();
    const doc = newDoc(`Chek ${no}`, lang);
    const t = (uz: string, ru: string, en: string) => tl(doc, uz, ru, en);
    const ps = (x: string) => (lang === 'uz' ? PAY_UZ[x] : lang === 'ru' ? PAY_RU[x] : PAY_EN[x]) ?? x;
    header(doc, t("TO'LOV CHEKI", 'ЧЕК ОБ ОПЛАТЕ', 'PAYMENT RECEIPT'), `№ ${no}  •  ${dt(payment.createdAt)}`);

    sectionTitle(doc, t("To'lov", 'Оплата', 'Payment'));
    rows(doc, [
      [t("To'lov ID", 'ID платежа', 'Payment ID'), payment.id],
      ['Mahsulot summasi (fermerga)', som(String(payment.amount))],
      ...(Number(payment.deliveryFee) > 0 ? [
        [t('Yetkazib berish haqi (haydovchiga)', 'Стоимость доставки (водителю)', 'Delivery fee (to driver)'), som(String(payment.deliveryFee))] as [string, string],
        [t('Xizmat haqi (platforma)', 'Сервисный сбор (платформа)', 'Service fee (platform)'), som(String(payment.serviceFee))] as [string, string],
      ] : []),
      [t("Jami (market to'ladi)", 'Итого (оплатил магазин)', 'Total (paid by market)'), som(String(Number(payment.amount) + Number(payment.deliveryFee) + Number(payment.serviceFee)))],
      ...(Number(payment.feeAmount) > 0 ? [[t('Omborxona xizmat haqi (summaga kiradi)', 'Складской сбор (входит в сумму)', 'Warehouse fee (included in amount)'), som(String(payment.feeAmount))] as [string, string]] : []),
      [t('Holati', 'Статус', 'Status'), ps(payment.status)],
      [t('Provayder', 'Провайдер', 'Provider'), payment.provider + (payment.providerRef ? ` (${payment.providerRef})` : '')],
      [t("Escrow'ga o'tgan", 'Поступило в эскроу', 'Held in escrow'), dt(payment.heldAt)],
      [t("Fermerga o'tkazilgan", 'Переведено фермеру', 'Released to farmer'), dt(payment.releasedAt)],
      [t('Qaytarilgan', 'Возвращено', 'Refunded'), dt(payment.refundedAt)],
    ]);
    sectionTitle(doc, t('Tomonlar', 'Стороны', 'Parties'));
    partyBoxes(doc, [
      { title: t("To'lovchi (Market)", 'Плательщик (магазин)', 'Payer (Market)'), lines: [s.market.companyName, s.market.user.fullName, s.market.user.phone] },
      { title: t('Oluvchi (Fermer)', 'Получатель (фермер)', 'Payee (Farmer)'), lines: [s.farmer.farmName, s.farmer.user.fullName, s.farmer.user.phone] },
    ]);
    sectionTitle(doc, t('Yuk', 'Груз', 'Cargo'));
    rows(doc, [
      [t('Yuk ID', 'ID груза', 'Cargo ID'), s.id],
      [t('Mahsulot', 'Товар', 'Product'), `${s.cargoName} (${s.category})`],
      [t('Vazni', 'Вес', 'Weight'), kg(String(s.weightKg))],
      [t('Marshrut', 'Маршрут', 'Route'), `${s.originRegion}, ${s.originDistrict} → ${s.destRegion}, ${s.destDistrict}`],
    ]);
    securityBlock(doc, await this.qr('receipt', s.id, code), this.pretty(code), t("Bu chek AgrarGo tomonidan avtomatik shakllantirilgan. QR-kod yoki kod orqali haqiqiyligini tekshirish mumkin.", 'Этот чек сформирован AgrarGo автоматически. Подлинность можно проверить по QR-коду или коду.', 'This receipt was generated automatically by AgrarGo. Authenticity can be verified via the QR code or code.'));
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
