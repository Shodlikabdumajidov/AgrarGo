import { C, Lang, docLang, dt } from './pdf-layout';

/**
 * Bill of Lading (BOL) & Invoice: Amerika B2B BOL shakli ("BOL shablon.jpg") asosida.
 * Bloklar: SHIP FROM / SHIP TO / BILL TO, SPECIAL INSTRUCTIONS & INCOTERMS (chap), BOL raqami + QR, CARRIER va yuk identifikatorlari,
 * Freight Charge Terms (o'ng), SHIPMENT SUMMARY, ITEM jadvali, ESCROW muhri + hisob-faktura jami, SHIPPER / CARRIER / CONSIGNEE imzolari (PIN elektron imzo).
 * Bu fayl faqat chizish va sof hisob-kitob funksiyalari (ma'lumotlar bazasiga bog'liq emas) — unit testlanadi.
 */

export interface BolParty { name: string; address: string; cityStateZip: string; phone: string; stir: string | null; contact?: string }
export type Payer = 'BUYER' | 'FARMER';
export type FreightTerms = 'PREPAID' | 'COLLECT' | 'THIRD_PARTY';

export interface BolSignature { printedName: string; confirmed: boolean; method: string; at: Date | null }

export interface BolData {
  bolNumber: string;
  printDate: Date;
  issuedAt: Date;
  verifyCode: string;
  qr: Buffer;
  shipFrom: BolParty;
  shipTo: BolParty;
  billTo: BolParty;
  billingInstructions: string;
  carrier: { name: string; license: string | null; vehicle: string; plate: string; phone: string };
  ids: { shipmentId: string; orderRef: string; pickupAt: Date | null; deliveredAt: Date | null; status: string; source: string; custRef: string };
  incoterm: { code: string; label: string; payer: Payer; terms: FreightTerms };
  instructions: string[];
  summary: { packages: number; totalWeightKg: number; commodity: string; category: string };
  items: { orderNo: string; itemNo: string; qty: number; uom: string; packageType: string; description: string; unitPrice: number; amount: number }[];
  totals: { product: number; freight: number; service: number; total: number; farmerNet: number | null; freightPaidBy: string };
  escrow: { status: string; stamp: string; sub: string; tone: 'green' | 'amber' | 'red' | 'gray' };
  signatures: { shipper: BolSignature; carrier: BolSignature; consignee: BolSignature };
}

// ---------- Sof hisob-kitoblar (unit testlanadi) ----------

/** BOL raqami: AGB2B-YYYY-NNNNNN (YYYY — berilgan sana yili, NNNNNN — nol bilan to'ldirilgan tartib raqami) */
export const bolNumber = (no: number, date: Date) => `AGB2B-${date.getUTCFullYear()}-${String(no).padStart(6, '0')}`;

/** Yetkazib berish kimning hisobidan: Incoterms kodi va Freight Charge Terms (BUYER — Collect, FARMER — Prepaid) */
export function incotermOf(payer: Payer, lang: Lang | 'bi' = 'bi'): { code: string; label: string; terms: FreightTerms } {
  if (lang === 'ru') return payer === 'FARMER'
    ? { code: 'DAP', label: 'DAP — поставка в месте назначения: доставку оплачивает ФЕРМЕР (фрахт ПРЕДОПЛАЧЕН, стоимость доставки удерживается из выплаты фермеру)', terms: 'PREPAID' }
    : { code: 'FCA', label: 'FCA — франко-перевозчик: доставку оплачивает ПОКУПАТЕЛЬ (фрахт ПРИ ПОЛУЧЕНИИ, стоимость доставки добавляется к цене товара)', terms: 'COLLECT' };
  if (lang === 'uz') return payer === 'FARMER'
    ? { code: 'DAP', label: "DAP — Manzilda yetkazib berish: yetkazib berishni FERMER to'laydi (yo'l haqi oldindan to'langan, fermer oladigan summadan ushlanadi)", terms: 'PREPAID' }
    : { code: 'FCA', label: "FCA — Tashuvchiga topshirish: yetkazib berishni XARIDOR to'laydi (yo'l haqi qabulda to'lanadi, mahsulot narxiga qo'shiladi)", terms: 'COLLECT' };
  return payer === 'FARMER'
    ? { code: 'DAP', label: "DAP — Delivered at Place: yetkazib berishni FERMER to'laydi (Freight PREPAID, yo'l haqi fermer oladigan summadan ushlanadi)", terms: 'PREPAID' }
    : { code: 'FCA', label: "FCA — Free Carrier: yetkazib berishni XARIDOR to'laydi (Freight COLLECT, yo'l haqi mahsulot narxiga qo'shiladi)", terms: 'COLLECT' };
}

/** Standart qadoq: don — qop (50 kg), sabzavot/meva — yashik (20 kg), qolganlari — tonna (yalpi). Soni vazndan hisoblanadi. */
export function packagingFor(category: string, weightKg: number): { type: string; uom: string; qty: number; unitKg: number } {
  const c = (category || '').toLowerCase();
  if (c.startsWith('don')) return { type: 'qop', uom: 'QOP', qty: Math.max(1, Math.ceil(weightKg / 50)), unitKg: 50 };
  if (c.startsWith('sabzavot') || c.startsWith('meva')) return { type: 'yashik', uom: 'YASHIK', qty: Math.max(1, Math.ceil(weightKg / 20)), unitKg: 20 };
  return { type: 'tonna', uom: 'TN', qty: Math.round((weightKg / 1000) * 1000) / 1000, unitKg: 1000 };
}

/** Escrow muhri matni (to'lov holatiga qarab) */
export function escrowStamp(status: string | null | undefined, lang: Lang | 'bi' = 'bi'): BolData['escrow'] {
  if (lang === 'uz' || lang === 'ru') {
    const uz = lang === 'uz';
    const m: Record<string, [string, string, BolData['escrow']['tone']]> = uz ? {
      HELD: ["TO'LANGAN — ESCROW'DA", "Mablag' escrow'da xavfsiz saqlanmoqda", 'green'],
      RELEASED: ["TO'LANGAN — O'TKAZILGAN", "Mablag' fermer va haydovchiga o'tkazilgan", 'green'],
      PENDING: ["TO'LOV KUTILMOQDA", "Xaridor mablag'ni escrow'ga o'tkazmagan", 'amber'],
      REFUNDED: ['QAYTARILGAN', "Mablag' xaridorga qaytarilgan", 'red'],
      CANCELLED: ['BEKOR QILINGAN', 'Buyurtma bekor qilingan', 'red'],
    } : {
      HELD: ['ОПЛАЧЕНО — В ЭСКРОУ', 'Средства надёжно удерживаются в эскроу', 'green'],
      RELEASED: ['ОПЛАЧЕНО — ПЕРЕВЕДЕНО', 'Средства переведены фермеру и водителю', 'green'],
      PENDING: ['ОЖИДАЕТ ОПЛАТЫ', 'Покупатель не внёс средства в эскроу', 'amber'],
      REFUNDED: ['ВОЗВРАЩЕНО', 'Средства возвращены покупателю', 'red'],
      CANCELLED: ['ОТМЕНЕНО', 'Заказ отменён', 'red'],
    };
    const r = m[status ?? ''];
    if (r) return { status: status as string, stamp: r[0], sub: r[1], tone: r[2] };
    return { status: 'NONE', stamp: uz ? "TO'LOV BOSHLANMAGAN" : 'ОПЛАТА НЕ НАЧАТА', sub: uz ? "Bu yuk uchun to'lov yaratilmagan" : 'Для этого груза платёж не создан', tone: 'gray' };
  }
  switch (status) {
    case 'HELD': return { status: 'HELD', stamp: "TO'LANGAN / ESCROW HELD", sub: "Mablag' escrow'da xavfsiz saqlanmoqda", tone: 'green' };
    case 'RELEASED': return { status: 'RELEASED', stamp: "TO'LANGAN / PAID — RELEASED", sub: "Mablag' fermer va haydovchiga o'tkazilgan", tone: 'green' };
    case 'PENDING': return { status: 'PENDING', stamp: "TO'LOV KUTILMOQDA / PAYMENT PENDING", sub: "Xaridor mablag'ni escrow'ga o'tkazmagan", tone: 'amber' };
    case 'REFUNDED': return { status: 'REFUNDED', stamp: 'QAYTARILGAN / REFUNDED', sub: "Mablag' xaridorga qaytarilgan", tone: 'red' };
    case 'CANCELLED': return { status: 'CANCELLED', stamp: 'BEKOR QILINGAN / VOID', sub: 'Buyurtma bekor qilingan', tone: 'red' };
    default: return { status: 'NONE', stamp: "TO'LOV BOSHLANMAGAN / NO PAYMENT", sub: "Bu yuk uchun to'lov yaratilmagan", tone: 'gray' };
  }
}

/** PIN elektron imzo: PIN tasdiqlangan bo'lsa «PIN-VERIFIED», aks holda holat bo'yicha (PIN talab qilinmagan yuklar) yoki kutilmoqda */
export function signatureOf(printedName: string, pinAt: Date | null, fallbackAt: Date | null, fallbackMethod: string): BolSignature {
  if (pinAt) return { printedName, confirmed: true, method: 'PIN-VERIFIED', at: pinAt };
  if (fallbackAt) return { printedName, confirmed: true, method: fallbackMethod, at: fallbackAt };
  return { printedName, confirmed: false, method: 'AWAITING PIN', at: null };
}

const ELLIPSIS = '…';
const moneyFmt = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/[  ]/g, ' ');
export const fmtMoney = (n: number) => `${moneyFmt(n)} so'm`;
export const fmtKg = (n: number) => `${n.toLocaleString('ru-RU', { maximumFractionDigits: 2 }).replace(/[  ]/g, ' ')} kg`;
const fmtTons = (kg: number) => `${(kg / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 3 }).replace(/[  ]/g, ' ')} tn`;
const ddmmyyyy = (d: Date | null) => (d ? dt(d)!.slice(0, 16) : '—');


// ---------- Tarjimalar (kalit — inglizcha matn; 'en' da o'zgarishsiz qoladi) ----------

const TR: [string, string, string][] = [
  ['BILL OF LADING & INVOICE', 'YUK TASHISH SHARTNOMASI VA HISOB-FAKTURA', 'ТРАНСПОРТНАЯ НАКЛАДНАЯ И СЧЁТ-ФАКТУРА'],
  ['Yuk xati va hisob-faktura  •  AgrarGo B2B', 'Bill of Lading (BOL) va hisob-faktura  •  AgrarGo B2B', 'Bill of Lading (BOL) и счёт-фактура  •  AgrarGo B2B'],
  ['Print Date', 'Chop etilgan sana', 'Дата печати'],
  ['Page 1 of 1', '1-sahifa / 1', 'Стр. 1 из 1'],
  ["SHIP FROM  /  JO'NATUVCHI (FERMER)", 'YUBORUVCHI (FERMER)', 'ОТПРАВИТЕЛЬ (ФЕРМЕР)'],
  ['SHIP TO  /  QABUL QILUVCHI (MARKET)', 'QABUL QILUVCHI (MARKET)', 'ПОЛУЧАТЕЛЬ (МАГАЗИН)'],
  ["BILL TO  /  TO'LOVCHI", "TO'LOVCHI", 'ПЛАТЕЛЬЩИК'],
  ['Name:', 'Nomi:', 'Название:'], ['Address:', 'Manzil:', 'Адрес:'], ['City/State/Zip:', 'Tuman/Viloyat:', 'Район/Область:'], ['Tel / STIR:', 'Tel / STIR:', 'Тел / ИНН:'],
  ['Billing Instructions:', "To'lov ko'rsatmalari:", 'Условия оплаты:'],
  ['SPECIAL INSTRUCTIONS & INCOTERMS', "MAXSUS KO'RSATMALAR VA INCOTERMS", 'ОСОБЫЕ УКАЗАНИЯ И ИНКОТЕРМС'],
  ['Bill of Lading #:', 'BOL raqami:', 'Номер BOL:'], ['Date', 'Sana', 'Дата'], ['Scan to verify', 'Tekshirish: skanerlang', 'Сканируйте'],
  ['Carrier Name:', 'Tashuvchi:', 'Перевозчик:'], ['License (SCAC):', 'Guvohnoma:', 'Удостоверение:'], ['Vehicle:', 'Transport:', 'Транспорт:'], ['Trailer / Plate:', 'Davlat raqami:', 'Гос. номер:'],
  ['Carrier Tel:', 'Tashuvchi tel:', 'Тел. перевозчика:'], ['Shipment ID:', 'Yuk ID:', 'ID груза:'], ['PRO / Order Ref:', 'Buyurtma raqami:', 'Номер заказа:'], ['Source:', 'Manba:', 'Источник:'],
  ['Pickup Date:', 'Yuklash sanasi:', 'Дата погрузки:'], ['Delivery Date:', 'Yetkazish sanasi:', 'Дата доставки:'], ['Status:', 'Holati:', 'Статус:'], ['Hazardous:', 'Xavfli yuk:', 'Опасный груз:'], ['Cust Ref:', 'Mijoz ref:', 'Реф. клиента:'],
  ['Freight Charge Terms (Freight charges are prepaid unless marked otherwise):', "Yuk tashish to'lovi shartlari (boshqacha belgilanmasa, oldindan to'langan):", 'Условия оплаты перевозки (если не указано иное — предоплата):'],
  ['Prepaid', 'Oldindan', 'Предоплата'], ['Collect', 'Qabulda', 'При получ.'], ['3rd Party', '3-shaxs', '3-е лицо'],
  ['Master Bill of Lading: AgrarGo elektron BOL (PIN-kod elektron imzosi bilan)', 'Asosiy BOL: AgrarGo elektron BOL (PIN-kod elektron imzosi bilan)', 'Основной BOL: электронный BOL AgrarGo (с электронной подписью по PIN-коду)'],
  ['SHIPMENT SUMMARY INFORMATION', "YUK BO'YICHA UMUMIY MA'LUMOT", 'СВОДКА ПО ГРУЗУ'],
  ['SHIPMENT ID', 'YUK ID', 'ID ГРУЗА'], ['PACKAGES', 'QADOQLAR', 'МЕСТА'], ['TOTAL WEIGHT', 'JAMI VAZN', 'ОБЩИЙ ВЕС'], ['COMMODITY DESCRIPTION', 'YUK TAVSIFI', 'ОПИСАНИЕ ГРУЗА'], ['CATEGORY', 'TOIFA', 'КАТЕГОРИЯ'],
  ['CARRIER ITEM TABLE  /  CUSTOMER ORDER INFORMATION', "YUK JADVALI  /  BUYURTMA MA'LUMOTI", 'ТАБЛИЦА ГРУЗА  /  ДАННЫЕ ЗАКАЗА'],
  ['ORDER NO', 'BUYURTMA №', 'ЗАКАЗ №'], ['ITEM #', 'POZ. №', 'ПОЗ. №'], ['QTY', 'SONI', 'КОЛ-ВО'], ['UOM (PACKAGE)', "O'LCHOV (QADOQ)", 'ЕД. (УПАКОВКА)'], ['ITEM DESCRIPTION', 'MAHSULOT TAVSIFI', 'ОПИСАНИЕ ТОВАРА'], ['UNIT PRICE', 'BIRLIK NARXI', 'ЦЕНА'], ['AMOUNT', 'SUMMA', 'СУММА'],
  ['Product (mahsulot)', 'Mahsulot', 'Товар'], ['Platform service fee (xizmat haqi)', 'Platforma xizmat haqi', 'Сервисный сбор платформы'],
  ["TOTAL PAYABLE (market to'laydi)", "JAMI TO'LOV (market to'laydi)", 'ИТОГО К ОПЛАТЕ (платит магазин)'],
  ['Farmer net (freight ushlab qolingan)', "Fermerga o'tadigan summa (yo'l haqi ushlab qolingan)", 'Фермеру к выплате (за вычетом доставки)'],
  ['Freight (yetkazib berish)', 'Yetkazib berish', 'Доставка'],
  ['SHIPPER (FERMER)', 'YUBORUVCHI (FERMER)', 'ОТПРАВИТЕЛЬ (ФЕРМЕР)'], ['CARRIER (HAYDOVCHI)', 'TASHUVCHI (HAYDOVCHI)', 'ПЕРЕВОЗЧИК (ВОДИТЕЛЬ)'], ['CONSIGNEE (MARKET)', 'QABUL QILUVCHI (MARKET)', 'ПОЛУЧАТЕЛЬ (МАГАЗИН)'],
  ['This is to certify that the above named materials are properly classified, described, packaged, marked and labeled, and are in proper condition for transportation.', "Yuqorida nomi keltirilgan yuk to'g'ri tasniflangan, tavsiflangan, qadoqlangan, markirovkalangan va tashish uchun yaroqli holatda ekanligi tasdiqlanadi.", 'Настоящим подтверждается, что указанный груз правильно классифицирован, описан, упакован, маркирован и находится в надлежащем для перевозки состоянии.'],
  ['Carrier acknowledges receipt of packages. Property described above is received in good order, except as noted. PIN-code = e-signature.', "Tashuvchi yukni qabul qilganini tasdiqlaydi. Yuqoridagi yuk, izohlardan tashqari, yaxshi holatda qabul qilingan. PIN-kod = elektron imzo.", 'Перевозчик подтверждает получение мест. Груз принят в надлежащем состоянии, кроме отмеченного. PIN-код = электронная подпись.'],
  ['Consignee acknowledges receipt of the above property in good order. The consignee PIN entered by the carrier on delivery serves as e-signature.', "Qabul qiluvchi yuqoridagi yukni yaxshi holatda olganini tasdiqlaydi. Topshirishda haydovchi kiritgan market PIN-kodi elektron imzo hisoblanadi.", 'Получатель подтверждает получение груза в надлежащем состоянии. PIN-код получателя, введённый водителем при доставке, служит электронной подписью.'],
  ["Fermer haydovchining PIN-kodini kiritgan: elektron imzo", "Fermer haydovchining PIN-kodini kiritgan: elektron imzo", 'Фермер ввёл PIN-код водителя: электронная подпись'],
  ["Haydovchi o'z PIN-kodi bilan yukni qabul qilgan", "Haydovchi o'z PIN-kodi bilan yukni qabul qilgan", 'Водитель принял груз по своему PIN-коду'],
  ['Market PIN-kodi topshirishda kiritilgan: elektron imzo', 'Market PIN-kodi topshirishda kiritilgan: elektron imzo', 'PIN-код магазина введён при доставке: электронная подпись'],
  ['PRINTED NAME:', 'F.I.SH.:', 'Ф.И.О.:'], ['E-SIGNATURE:', 'E-IMZO:', 'ЭЛ. ПОДПИСЬ:'], ['DATE / TIME:', 'SANA / VAQT:', 'ДАТА / ВРЕМЯ:'],
  ['PIN-VERIFIED', 'PIN-VERIFIED ELEKTRON IMZO', 'PIN-ПОДТВЕРЖДЕНО (ЭЛ. ПОДПИСЬ)'], ['AWAITING PIN', 'PIN KUTILMOQDA', 'ОЖИДАЕТСЯ PIN'],
  ['CONFIRMED (status)', 'TASDIQLANGAN (holat)', 'ПОДТВЕРЖДЕНО (статус)'], ['ASSIGNED (status)', 'BIRIKTIRILGAN (holat)', 'НАЗНАЧЕН (статус)'],
  ['Verification code', 'Tekshiruv kodi', 'Код проверки'],
  ['Electronically generated by AgrarGo; verify via QR code.', "AgrarGo tomonidan elektron shaklda shakllantirilgan; QR-kod orqali tekshiring.", 'Сформировано электронно в AgrarGo; проверьте по QR-коду.'],
  ['qop', 'qop', 'мешок'], ['yashik', 'yashik', 'ящик'], ['tonna', 'tonna', 'тонна'], ['QOP', 'QOP', 'МЕШОК'], ['YASHIK', 'YASHIK', 'ЯЩИК'], ['TN', 'TN', 'Т'],
];
const MAPS: Record<'uz' | 'ru', Map<string, string>> = { uz: new Map(TR.map((r) => [r[0], r[1]])), ru: new Map(TR.map((r) => [r[0], r[2]])) };
/** Hujjat tiliga tarjima (inglizcha kalit; topilmasa o'zgarishsiz) */
const tr = (doc: PDFKit.PDFDocument, key: string) => { const l = docLang(doc); return l === 'en' ? key : MAPS[l].get(key) ?? key; };
/** Pul va og'irlik birliklari: ruscha hujjatda «сум» / «кг» */
const unitsFor = (doc: PDFKit.PDFDocument, v: string) => (docLang(doc) === 'ru' ? v.replace(/so'm/g, 'сум').replace(/ kg\b/g, ' кг').replace(/ tn\b/g, ' т').replace(/\/kg/g, '/кг') : v);

// ---------- Chizish ----------

const M = 28;
const BLACK = '#111827';
type Doc = PDFKit.PDFDocument;

function bar(doc: Doc, x: number, y: number, w: number, text: string) {
  doc.rect(x, y, w, 13).fill(BLACK);
  doc.font('b').fontSize(7.5).fillColor('#ffffff').text(tr(doc, text), x, y + 3.2, { width: w, align: 'center', characterSpacing: 0.6, lineBreak: false });
  doc.fillColor(BLACK);
}
function box(doc: Doc, x: number, y: number, w: number, h: number) { doc.rect(x, y, w, h).lineWidth(0.7).strokeColor(BLACK).stroke(); }
function text(doc: Doc, t: string, x: number, y: number, w: number, o: { size?: number; bold?: boolean; color?: string; align?: 'left' | 'right' | 'center'; height?: number } = {}) {
  doc.font(o.bold ? 'b' : 'r').fontSize(o.size ?? 8).fillColor(o.color ?? BLACK).text(unitsFor(doc, tr(doc, t || '—')), x, y, { width: w, height: o.height ?? (o.size ?? 8) + 2, align: o.align ?? 'left', ellipsis: ELLIPSIS, lineBreak: true });
}
function labelValue(doc: Doc, x: number, y: number, w: number, label: string, value: string, labelW: number) {
  text(doc, label, x, y, labelW, { size: 6.8, bold: true, color: '#374151' });
  text(doc, value, x + labelW, y, w - labelW, { size: 8, bold: true });
}
function partyBlock(doc: Doc, x: number, y: number, w: number, title: string, p: BolParty, fob?: string, h = 70) {
  bar(doc, x, y, w, title);
  box(doc, x, y + 13, w, h);
  const lw = 66;
  labelValue(doc, x + 5, y + 18, w - 10, 'Name:', p.name, lw);
  labelValue(doc, x + 5, y + 30, w - 10, 'Address:', p.address, lw);
  labelValue(doc, x + 5, y + 42, w - 10, 'City/State/Zip:', p.cityStateZip, lw);
  labelValue(doc, x + 5, y + 54, w - 10, 'Tel / STIR:', `${p.phone}${p.stir ? '  •  ' + (docLang(doc) === 'ru' ? 'ИНН' : 'STIR') + ': ' + p.stir : ''}`, lw);
  if (fob) text(doc, `FOB: ${fob}`, x + w - 90, y + 13 + h - 11, 86, { size: 6.8, bold: true, align: 'right' });
  return y + 13 + h;
}

function checkbox(doc: Doc, x: number, y: number, label: string, on: boolean) {
  doc.rect(x, y, 8, 8).lineWidth(0.7).strokeColor(BLACK).stroke();
  if (on) doc.font('b').fontSize(9).fillColor(BLACK).text('✔', x - 0.2, y - 1.4, { lineBreak: false });
  text(doc, label, x + 11, y + 0.5, 60, { size: 7, bold: true });
}

function table(doc: Doc, x: number, y: number, cols: { w: number; head: string; align?: 'left' | 'right' | 'center' }[], rows: string[][], rowH = 15) {
  let cx = x;
  doc.rect(x, y, cols.reduce((a, c) => a + c.w, 0), rowH).fill('#e5e7eb');
  cols.forEach((c) => { text(doc, c.head, cx + 3, y + 4, c.w - 6, { size: 6.8, bold: true, align: c.align ?? 'left' }); cx += c.w; });
  let ry = y + rowH;
  for (const r of rows) {
    cx = x;
    cols.forEach((c, i) => { text(doc, r[i] ?? '', cx + 3, ry + 4, c.w - 6, { size: 7.6, align: c.align ?? 'left', bold: i === 0, height: rowH - 4 }); cx += c.w; });
    ry += rowH;
  }
  const W = cols.reduce((a, c) => a + c.w, 0);
  box(doc, x, y, W, ry - y);
  let vx = x;
  cols.slice(0, -1).forEach((c) => { vx += c.w; doc.moveTo(vx, y).lineTo(vx, ry).lineWidth(0.5).strokeColor(BLACK).stroke(); });
  for (let yy = y + rowH; yy < ry; yy += rowH) doc.moveTo(x, yy).lineTo(x + W, yy).lineWidth(0.5).strokeColor(BLACK).stroke();
  return ry;
}

function stamp(doc: Doc, x: number, y: number, w: number, e: BolData['escrow']) {
  const col = e.tone === 'green' ? '#047857' : e.tone === 'amber' ? '#b45309' : e.tone === 'red' ? '#b91c1c' : '#475569';
  doc.save();
  doc.rotate(-6, { origin: [x + w / 2, y + 28] });
  doc.roundedRect(x, y, w, 56, 6).lineWidth(2.2).strokeColor(col).stroke();
  doc.roundedRect(x + 3, y + 3, w - 6, 50, 4).lineWidth(0.6).strokeColor(col).stroke();
  doc.font('b').fontSize(11.5).fillColor(col).text(e.stamp, x + 6, y + 12, { width: w - 12, align: 'center', height: 28 });
  doc.font('r').fontSize(6.8).fillColor(col).text(e.sub, x + 6, y + 41, { width: w - 12, align: 'center', height: 10, ellipsis: ELLIPSIS });
  doc.restore();
  doc.fillColor(BLACK);
}

function signBlock(doc: Doc, x: number, y: number, w: number, title: string, cert: string, s: BolSignature, role: string) {
  bar(doc, x, y, w, title);
  box(doc, x, y + 13, w, 108);
  text(doc, cert, x + 5, y + 17, w - 10, { size: 6.2, color: '#374151', height: 30 });
  labelValue(doc, x + 5, y + 50, w - 10, 'PRINTED NAME:', s.printedName, 62);
  text(doc, 'E-SIGNATURE:', x + 5, y + 66, 62, { size: 6.8, bold: true, color: '#374151' });
  if (s.confirmed) {
    doc.font('b').fontSize(9).fillColor('#047857').text('✔', x + 68, y + 64, { lineBreak: false });
    text(doc, s.method, x + 80, y + 64, w - 86, { size: 6.4, bold: true, color: '#047857', height: 16 });
  } else {
    text(doc, s.method, x + 68, y + 66, w - 74, { size: 7.4, bold: true, color: '#b45309' });
  }
  doc.moveTo(x + 68, y + 76).lineTo(x + w - 6, y + 76).lineWidth(0.4).strokeColor('#6b7280').stroke();
  labelValue(doc, x + 5, y + 82, w - 10, 'DATE / TIME:', s.at ? dt(s.at)! : '—', 62);
  text(doc, role, x + 5, y + 98, w - 10, { size: 6, color: '#6b7280', height: 20 });
}

/** BOL & Invoice sahifasini chizadi (A4, 1 sahifa) */
export function renderBol(doc: Doc, d: BolData): void {
  const W = doc.page.width - M * 2;
  const L = 292, R = W - L; // chap va o'ng ustun kengligi
  // --- Sarlavha ---
  text(doc, `${tr(doc, 'Print Date')}: ${ddmmyyyy(d.printDate)}`, M, M, 200, { size: 7.5 });
  text(doc, d.bolNumber, M, M + 10, 200, { size: 7.5, bold: true });
  text(doc, 'BILL OF LADING & INVOICE', M, M + (docLang(doc) === 'en' ? 2 : 5), W, { size: docLang(doc) === 'en' ? 17 : 12.5, bold: true, align: 'center', height: 22 });
  text(doc, "Yuk xati va hisob-faktura  •  AgrarGo B2B", M, M + 22, W, { size: 7.5, color: '#4b5563', align: 'center' });
  text(doc, 'Page 1 of 1', M, M + 2, W, { size: 8, bold: true, align: 'right' });

  const top = M + 38;
  // --- Chap ustun ---
  let y = partyBlock(doc, M, top, L, 'SHIP FROM  /  JO\'NATUVCHI (FERMER)', d.shipFrom, d.incoterm.code);
  y = partyBlock(doc, M, y + 2, L, 'SHIP TO  /  QABUL QILUVCHI (MARKET)', d.shipTo, d.incoterm.code);
  // BILL TO
  bar(doc, M, y + 2, L, 'BILL TO  /  TO\'LOVCHI');
  const btY = y + 15;
  box(doc, M, btY, L, 74);
  labelValue(doc, M + 5, btY + 5, L - 10, 'Name:', d.billTo.name, 66);
  labelValue(doc, M + 5, btY + 17, L - 10, 'Address:', d.billTo.address, 66);
  labelValue(doc, M + 5, btY + 29, L - 10, 'City/State/Zip:', d.billTo.cityStateZip, 66);
  text(doc, 'Billing Instructions:', M + 5, btY + 43, 100, { size: 6.8, bold: true, color: '#374151' });
  text(doc, d.billingInstructions, M + 5, btY + 52, L - 10, { size: 6.6, height: 20 });
  y = btY + 74;
  // SPECIAL INSTRUCTIONS & INCOTERMS
  bar(doc, M, y + 2, L, 'SPECIAL INSTRUCTIONS & INCOTERMS');
  const siY = y + 15, siH = 96;
  box(doc, M, siY, L, siH);
  text(doc, d.incoterm.label, M + 5, siY + 4, L - 10, { size: 7, bold: true, height: 30 });
  let iy = siY + 36;
  d.instructions.forEach((t) => { text(doc, `• ${t}`, M + 5, iy, L - 10, { size: 6.5, height: 18 }); iy += 14; });
  const leftEnd = siY + siH;

  // --- O'ng ustun ---
  const rx = M + L + 4, rw = R - 4;
  box(doc, rx, top, rw, leftEnd - top);
  text(doc, 'Bill of Lading #:', rx + 5, top + 5, 80, { size: 6.8, bold: true, color: '#374151' });
  text(doc, d.bolNumber, rx + 5, top + 14, rw - 80, { size: 9.5, bold: true, height: 12 });
  text(doc, `${tr(doc, 'Date')}: ${ddmmyyyy(d.issuedAt)}`, rx + 5, top + 29, rw - 80, { size: 7.2, bold: true });
  doc.image(d.qr, rx + rw - 66, top + 4, { width: 62, height: 62 });
  text(doc, 'Scan to verify', rx + rw - 66, top + 66, 62, { size: 5.6, align: 'center', color: '#6b7280' });
  const fields: [string, string][] = [
    ['Carrier Name:', d.carrier.name],
    ['License (SCAC):', d.carrier.license ?? '—'],
    ['Vehicle:', d.carrier.vehicle],
    ['Trailer / Plate:', d.carrier.plate],
    ['Carrier Tel:', d.carrier.phone],
    ['Shipment ID:', d.ids.shipmentId],
    ['PRO / Order Ref:', d.ids.orderRef],
    ['Source:', d.ids.source],
    ['Pickup Date:', ddmmyyyy(d.ids.pickupAt)],
    ['Delivery Date:', ddmmyyyy(d.ids.deliveredAt)],
    ['Status:', d.ids.status],
    ['Hazardous:', 'N'],
    ['Cust Ref:', d.ids.custRef],
  ];
  let fy = top + 82;
  fields.forEach(([k, v]) => {
    doc.moveTo(rx, fy - 1).lineTo(rx + rw, fy - 1).lineWidth(0.4).strokeColor('#9ca3af').stroke();
    text(doc, k, rx + 5, fy + 2, 74, { size: 6.8, bold: true, color: '#374151' });
    text(doc, v, rx + 80, fy + 2, rw - 85, { size: 7.4, bold: true });
    fy += 12.6;
  });
  doc.moveTo(rx, fy - 1).lineTo(rx + rw, fy - 1).lineWidth(0.7).strokeColor(BLACK).stroke();
  text(doc, 'Freight Charge Terms (Freight charges are prepaid unless marked otherwise):', rx + 5, fy + 2, rw - 10, { size: 6.2, bold: true, height: 16 });
  checkbox(doc, rx + 8, fy + 20, 'Prepaid', d.incoterm.terms === 'PREPAID');
  checkbox(doc, rx + 78, fy + 20, 'Collect', d.incoterm.terms === 'COLLECT');
  checkbox(doc, rx + 148, fy + 20, '3rd Party', d.incoterm.terms === 'THIRD_PARTY');
  text(doc, 'Master Bill of Lading: AgrarGo elektron BOL (PIN-kod elektron imzosi bilan)', rx + 5, fy + 34, rw - 10, { size: 6.2, color: '#374151', height: 16 });

  // --- SHIPMENT SUMMARY ---
  let ty = leftEnd + 8;
  bar(doc, M, ty, W, 'SHIPMENT SUMMARY INFORMATION');
  ty = table(doc, M, ty + 13, [
    { w: 130, head: 'SHIPMENT ID' }, { w: 70, head: 'PACKAGES', align: 'center' }, { w: 140, head: 'TOTAL WEIGHT', align: 'right' },
    { w: W - 130 - 70 - 140 - 60, head: 'COMMODITY DESCRIPTION' }, { w: 60, head: 'CATEGORY', align: 'center' },
  ], [[d.ids.shipmentId, String(d.items.reduce((a, i) => a + (i.uom === 'TN' ? 1 : i.qty), 0)), `${fmtKg(d.summary.totalWeightKg)} / ${fmtTons(d.summary.totalWeightKg)}`, d.summary.commodity, d.summary.category]]);

  // --- CARRIER ITEM / CUSTOMER ORDER INFORMATION ---
  ty += 8;
  bar(doc, M, ty, W, 'CARRIER ITEM TABLE  /  CUSTOMER ORDER INFORMATION');
  const itemRows = d.items.map((i) => [i.orderNo, i.itemNo, String(i.qty), `${tr(doc, i.uom)} (${tr(doc, i.packageType)})`, i.description, fmtMoney(i.unitPrice) + '/kg', fmtMoney(i.amount)]);
  ty = table(doc, M, ty + 13, [
    { w: 84, head: 'ORDER NO' }, { w: 56, head: 'ITEM #' }, { w: 48, head: 'QTY', align: 'right' }, { w: 78, head: 'UOM (PACKAGE)' },
    { w: W - 84 - 56 - 48 - 78 - 150, head: 'ITEM DESCRIPTION' }, { w: 70, head: 'UNIT PRICE', align: 'right' }, { w: 80, head: 'AMOUNT', align: 'right' },
  ], itemRows);

  // --- Escrow muhri + hisob-faktura jami ---
  ty += 10;
  stamp(doc, M + 6, ty + 4, 218, d.escrow);
  const iw = 262, ix = M + W - iw;
  const lines: [string, string, boolean?][] = [
    ['Product (mahsulot)', fmtMoney(d.totals.product)],
    [`${tr(doc, 'Freight (yetkazib berish)')} — ${d.totals.freightPaidBy}`, fmtMoney(d.totals.freight)],
    ['Platform service fee (xizmat haqi)', fmtMoney(d.totals.service)],
    ["TOTAL PAYABLE (market to'laydi)", fmtMoney(d.totals.total), true],
  ];
  if (d.totals.farmerNet !== null) lines.push(["Farmer net (freight ushlab qolingan)", fmtMoney(d.totals.farmerNet)]);
  let ly = ty;
  lines.forEach(([k, v, strong]) => {
    if (strong) doc.rect(ix, ly - 1, iw, 14).fill('#e5e7eb');
    text(doc, k, ix + 4, ly + 2, iw - 100, { size: 7, bold: !!strong });
    text(doc, v, ix + iw - 98, ly + 2, 94, { size: 7.6, bold: true, align: 'right' });
    ly += 14;
  });
  box(doc, ix, ty - 1, iw, ly - ty + 1);

  // --- Imzolar ---
  const sy = Math.max(ly, ty + 66) + 8;
  const sw = (W - 8) / 3;
  signBlock(doc, M, sy, sw, 'SHIPPER (FERMER)', 'This is to certify that the above named materials are properly classified, described, packaged, marked and labeled, and are in proper condition for transportation.', d.signatures.shipper, "Fermer haydovchining PIN-kodini kiritgan: elektron imzo");
  signBlock(doc, M + sw + 4, sy, sw, 'CARRIER (HAYDOVCHI)', 'Carrier acknowledges receipt of packages. Property described above is received in good order, except as noted. PIN-code = e-signature.', d.signatures.carrier, 'Haydovchi o\'z PIN-kodi bilan yukni qabul qilgan');
  signBlock(doc, M + (sw + 4) * 2, sy, sw, 'CONSIGNEE (MARKET)', 'Consignee acknowledges receipt of the above property in good order. The consignee PIN entered by the carrier on delivery serves as e-signature.', d.signatures.consignee, 'Market PIN-kodi topshirishda kiritilgan: elektron imzo');

  // --- Pastki qator ---
  const fy2 = doc.page.height - M - 14;
  doc.moveTo(M, fy2 - 3).lineTo(M + W, fy2 - 3).lineWidth(0.5).strokeColor(C.line).stroke();
  text(doc, `${tr(doc, 'Verification code')}: ${d.verifyCode}   •   ${d.bolNumber}   •   ${tr(doc, 'Electronically generated by AgrarGo; verify via QR code.')}`, M, fy2, W, { size: 6.4, color: '#4b5563', height: 10 });
}
