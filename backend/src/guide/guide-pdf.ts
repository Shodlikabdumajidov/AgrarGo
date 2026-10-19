import { C, LOGO, MARGIN, newDoc, pageWidth } from '../documents/pdf-layout';
import { GUIDE_ROLES, GuideRole, Lang, ROLE_META, UI_TEXT } from './guide-content';

const bottom = (doc: PDFKit.PDFDocument) => doc.page.height - MARGIN - 20;

function ensure(doc: PDFKit.PDFDocument, h: number) {
  if (doc.y + h > bottom(doc)) { doc.addPage(); doc.y = MARGIN; doc.x = MARGIN; }
}

function cover(doc: PDFKit.PDFDocument, lang: Lang, roles: GuideRole[]) {
  const W = doc.page.width, H = doc.page.height;
  doc.rect(0, 0, W, 330).fill(C.brand);
  doc.circle(W - 60, 70, 120).fillOpacity(0.12).fill('#ffffff').fillOpacity(1);
  doc.circle(80, 300, 80).fillOpacity(0.1).fill('#ffffff').fillOpacity(1);
  doc.roundedRect(MARGIN, 60, 76, 76, 14).fill('#ffffff');
  doc.image(LOGO, MARGIN + 8, 68, { height: 60 });
  doc.font('b').fontSize(34).fillColor('#ffffff').text('AgrarGo', MARGIN + 94, 74);
  doc.font('r').fontSize(12).fillColor('#d1fae5').text(UI_TEXT.subtitle[lang], MARGIN + 94, 118);
  doc.font('b').fontSize(26).fillColor('#ffffff').text(UI_TEXT.title[lang], MARGIN, 210, { width: W - MARGIN * 2 });
  doc.font('b').fontSize(12).fillColor(C.brand).text(UI_TEXT.contents[lang].toUpperCase(), MARGIN, 370, { characterSpacing: 1 });
  let y = 396;
  roles.forEach((r, i) => {
    const m = ROLE_META[r];
    doc.roundedRect(MARGIN, y, W - MARGIN * 2, 40, 8).fillAndStroke(C.soft, '#a7f3d0');
    doc.circle(MARGIN + 24, y + 20, 13).fill(C.brand);
    doc.font('b').fontSize(12).fillColor('#ffffff').text(String(i + 1), MARGIN + 18, y + 13, { width: 12, align: 'center' });
    doc.font('b').fontSize(12).fillColor(C.dark).text(m.title[lang], MARGIN + 48, y + 8);
    doc.font('r').fontSize(8).fillColor(C.muted).text(m.topics.map((t) => t.title[lang]).join(' · '), MARGIN + 48, y + 24, { width: W - MARGIN * 2 - 60, lineBreak: false, ellipsis: true });
    y += 50;
  });
  doc.font('r').fontSize(8).fillColor(C.muted).text(UI_TEXT.footer[lang], MARGIN, H - 50, { width: W - MARGIN * 2, align: 'center' });
}

function flow(doc: PDFKit.PDFDocument, labels: string[]) {
  const w = pageWidth(doc), gap = 22, bw = (w - gap * (labels.length - 1)) / labels.length, h = 54;
  ensure(doc, h + 16);
  const y = doc.y + 4;
  labels.forEach((l, i) => {
    const x = MARGIN + i * (bw + gap);
    doc.roundedRect(x, y, bw, h, 8).fillAndStroke(i === labels.length - 1 ? C.brand : C.soft, C.brand);
    doc.font('b').fontSize(8).fillColor(i === labels.length - 1 ? '#ffffff' : C.dark).text(l, x + 4, y + 10, { width: bw - 8, align: 'center', height: h - 14 });
    if (i < labels.length - 1) {
      const ax = x + bw + 3, ay = y + h / 2;
      doc.moveTo(ax, ay).lineTo(ax + gap - 8, ay).lineWidth(1.5).strokeColor(C.brand).stroke();
      doc.polygon([ax + gap - 8, ay - 4], [ax + gap - 8, ay + 4], [ax + gap - 2, ay]).fill(C.brand);
    }
  });
  doc.y = y + h + 12;
  doc.x = MARGIN;
}

/** Brendlangan PDF qo'llanma (barcha rollar yoki bitta rol) */
export function buildGuidePdf(lang: Lang, only?: GuideRole): Promise<Buffer> {
  const roles = GUIDE_ROLES.filter((r) => !only || r === only);
  const doc = newDoc(UI_TEXT.title[lang]);
  const chunks: Buffer[] = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(chunks))));

  cover(doc, lang, roles);
  const w = pageWidth(doc);
  for (const r of roles) {
    const m = ROLE_META[r];
    doc.addPage();
    doc.rect(0, 0, doc.page.width, 92).fill(C.brand);
    doc.font('b').fontSize(24).fillColor('#ffffff').text(m.title[lang], MARGIN, 28);
    doc.font('r').fontSize(10).fillColor('#d1fae5').text(m.intro[lang], MARGIN, 60, { width: w });
    doc.y = 112; doc.x = MARGIN;
    for (const t of m.topics) {
      ensure(doc, 90);
      doc.font('b').fontSize(13).fillColor(C.dark).text(t.title[lang], MARGIN, doc.y);
      doc.moveTo(MARGIN, doc.y + 2).lineTo(MARGIN + 40, doc.y + 2).lineWidth(2.5).strokeColor(C.brand).stroke();
      doc.y += 10;
      if (t.id === 'escrow') flow(doc, t.steps.map((s) => s.title[lang]));
      t.steps.forEach((s, i) => {
        const textH = doc.font('r').fontSize(9).heightOfString(s.text[lang], { width: w - 52 });
        const h = Math.max(36, 20 + textH + 8);
        ensure(doc, h + 6);
        const y = doc.y;
        doc.roundedRect(MARGIN, y, w, h, 8).fillAndStroke('#f8fafc', '#e2e8f0');
        doc.circle(MARGIN + 20, y + 20, 11).fill(C.brand);
        doc.font('b').fontSize(10).fillColor('#ffffff').text(String(i + 1), MARGIN + 14, y + 14.5, { width: 12, align: 'center' });
        doc.font('b').fontSize(10).fillColor(C.dark).text(s.title[lang], MARGIN + 42, y + 8, { width: w - 52 });
        doc.font('r').fontSize(9).fillColor(C.muted).text(s.text[lang], MARGIN + 42, y + 22, { width: w - 52 });
        doc.y = y + h + 6; doc.x = MARGIN;
      });
      doc.y += 10;
    }
  }
  // Sahifa raqamlari
  const range = doc.bufferedPageRange();
  void range;
  doc.end();
  return done;
}
