import PDFDocument from 'pdfkit';
import { join } from 'path';

/** Shrift: Lotin va Kirill harflarini (foydalanuvchi ismlari) to'g'ri chiqaradigan DejaVu (assets/fonts, ish papkasiga nisbatan) */
export const ASSETS_DIR = join(process.cwd(), 'assets');
const FONT = join(ASSETS_DIR, 'fonts', 'DejaVuSans.ttf');
const FONT_BOLD = join(ASSETS_DIR, 'fonts', 'DejaVuSans-Bold.ttf');
export const LOGO = join(ASSETS_DIR, 'newlogo.png');

export const C = { brand: '#059669', dark: '#0f172a', muted: '#64748b', line: '#cbd5e1', soft: '#ecfdf5' };
export const MARGIN = 40;

export type Lang = 'uz' | 'ru' | 'en';
/** Noma'lum/bo'sh til — berilgan standart til (TTN va chek uchun 'uz', BOL uchun 'en') */
export const parseLang = (v: unknown, fallback: Lang): Lang => (v === 'uz' || v === 'ru' || v === 'en' ? v : fallback);
const LANG_KEY = Symbol('lang');
export const docLang = (doc: PDFKit.PDFDocument): Lang => ((doc as any)[LANG_KEY] as Lang) ?? 'uz';
/** Hujjat tiliga mos matn tanlaydi: tl(doc, uz, ru, en) */
export const tl = (doc: PDFKit.PDFDocument, uz: string, ru: string, en: string) => { const l = docLang(doc); return l === 'ru' ? ru : l === 'en' ? en : uz; };

export function newDoc(title: string, lang: Lang = 'uz') {
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, info: { Title: title, Author: 'AgrarGo', Producer: 'AgrarGo' } });
  (doc as any)[LANG_KEY] = lang;
  doc.registerFont('r', FONT);
  doc.registerFont('b', FONT_BOLD);
  doc.font('r');
  return doc;
}

export const pageWidth = (doc: PDFKit.PDFDocument) => doc.page.width - MARGIN * 2;

export function header(doc: PDFKit.PDFDocument, title: string, subtitle: string) {
  // Logotip (502x123): faqat balandlik beriladi, eni nisbat bo'yicha (~139 pt); yozuv logotipning ichida
  doc.image(LOGO, MARGIN, MARGIN, { height: 34 });
  doc.font('r').fontSize(8).fillColor(C.muted).text(tl(doc, "Fermerdan to'g'ridan-to'g'ri B2B platforma", 'B2B-платформа: напрямую от фермера', 'Direct-from-farmer B2B platform'), MARGIN, MARGIN + 38);
  doc.font('b').fontSize(15).fillColor(C.dark).text(title, MARGIN, MARGIN + 6, { width: pageWidth(doc), align: 'right' });
  doc.font('r').fontSize(9).fillColor(C.muted).text(subtitle, MARGIN, MARGIN + 28, { width: pageWidth(doc), align: 'right' });
  const y = MARGIN + 56;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + pageWidth(doc), y).lineWidth(2).strokeColor(C.brand).stroke();
  doc.y = y + 14;
  doc.x = MARGIN;
}

export function sectionTitle(doc: PDFKit.PDFDocument, text: string) {
  doc.moveDown(0.4);
  doc.font('b').fontSize(10).fillColor(C.brand).text(text.toUpperCase(), MARGIN, doc.y, { characterSpacing: 0.6 });
  doc.moveDown(0.25);
}

/** Jadval qatori: label va qiymat (ikki ustun); qiymat bo'sh bo'lsa "—" */
export function rows(doc: PDFKit.PDFDocument, items: [string, string | null | undefined][], labelWidth = 130) {
  const w = pageWidth(doc);
  for (const [k, v] of items) {
    const y = doc.y;
    const text = v && String(v).trim() ? String(v) : '—';
    doc.font('r').fontSize(9).fillColor(C.muted).text(k, MARGIN, y, { width: labelWidth });
    const h1 = doc.heightOfString(k, { width: labelWidth });
    doc.font('b').fontSize(10).fillColor(C.dark).text(text, MARGIN + labelWidth, y, { width: w - labelWidth });
    const h2 = doc.heightOfString(text, { width: w - labelWidth });
    doc.y = y + Math.max(h1, h2) + 4;
    doc.moveTo(MARGIN, doc.y - 2).lineTo(MARGIN + w, doc.y - 2).lineWidth(0.4).strokeColor('#e2e8f0').stroke();
  }
}

/** Ikki ustunli tomonlar bloki (Yuboruvchi | Qabul qiluvchi | Tashuvchi) */
export function partyBoxes(doc: PDFKit.PDFDocument, parties: { title: string; lines: string[] }[]) {
  const gap = 10, w = (pageWidth(doc) - gap * (parties.length - 1)) / parties.length;
  const y = doc.y;
  let maxH = 0;
  parties.forEach((p, i) => {
    const x = MARGIN + i * (w + gap);
    doc.font('b').fontSize(8).fillColor(C.brand).text(p.title.toUpperCase(), x + 8, y + 8, { width: w - 16 });
    doc.font('r').fontSize(9).fillColor(C.dark);
    let yy = y + 22;
    p.lines.forEach((l, li) => {
      doc.font(li === 0 ? 'b' : 'r').text(l || '—', x + 8, yy, { width: w - 16 });
      yy += doc.heightOfString(l || '—', { width: w - 16 }) + 2;
    });
    maxH = Math.max(maxH, yy - y + 6);
  });
  parties.forEach((_, i) => doc.roundedRect(MARGIN + i * (w + gap), y, w, maxH, 6).lineWidth(0.8).strokeColor(C.line).stroke());
  doc.y = y + maxH + 6;
  doc.x = MARGIN;
}

export const som = (n: number | string) => `${Math.round(Number(n)).toLocaleString('ru-RU').replace(/ /g, ' ')} so'm`;
export const kg = (n: number | string) => `${Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 }).replace(/ /g, ' ')} kg`;
export const dt = (d: Date | null | undefined) => {
  if (!d) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
};

/** Xavfsizlik bloki: QR-kod + tekshiruv kodi */
export function securityBlock(doc: PDFKit.PDFDocument, qr: Buffer, code: string, note: string) {
  const y = Math.max(doc.y + 10, doc.page.height - MARGIN - 120);
  doc.roundedRect(MARGIN, y, pageWidth(doc), 100, 8).fillAndStroke(C.soft, C.brand);
  doc.image(qr, MARGIN + 10, y + 10, { width: 80, height: 80 });
  doc.font('b').fontSize(10).fillColor(C.brand).text(tl(doc, 'Xavfsizlik kodi', 'Код безопасности', 'Security code'), MARGIN + 104, y + 14);
  doc.font('b').fontSize(14).fillColor(C.dark).text(code, MARGIN + 104, y + 30, { characterSpacing: 1.2 });
  doc.font('r').fontSize(8).fillColor(C.muted).text(note, MARGIN + 104, y + 54, { width: pageWidth(doc) - 120 });
}
