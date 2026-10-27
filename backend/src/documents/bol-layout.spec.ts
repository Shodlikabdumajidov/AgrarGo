import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { BolData, bolNumber, escrowStamp, fmtMoney, incotermOf, packagingFor, renderBol, signatureOf } from './bol-layout';
import { newDoc } from './pdf-layout';

describe('BOL & Invoice: sof hisob-kitoblar', () => {
  it("BOL raqami: AGB2B-YYYY-NNNNNN, nol bilan to'ldirilgan", () => {
    expect(bolNumber(7, new Date('2026-10-27T10:00:00Z'))).toBe('AGB2B-2026-000007');
    expect(bolNumber(123456, new Date('2027-01-01T00:00:00Z'))).toBe('AGB2B-2027-123456');
  });
  it("Incoterms: xaridor to'lasa FCA / Collect, fermer to'lasa DAP / Prepaid", () => {
    expect(incotermOf('BUYER')).toMatchObject({ code: 'FCA', terms: 'COLLECT' });
    expect(incotermOf('FARMER')).toMatchObject({ code: 'DAP', terms: 'PREPAID' });
    expect(incotermOf('BUYER').label).toMatch(/XARIDOR/);
    expect(incotermOf('FARMER').label).toMatch(/FERMER/);
  });
  it("qadoq turi: don — qop (50 kg), sabzavot/meva — yashik (20 kg), qolganlari — tonna", () => {
    expect(packagingFor('Don', 1020)).toEqual({ type: 'qop', uom: 'QOP', qty: 21, unitKg: 50 });
    expect(packagingFor('Sabzavot', 2500)).toMatchObject({ type: 'yashik', uom: 'YASHIK', qty: 125 });
    expect(packagingFor('Meva', 15)).toMatchObject({ type: 'yashik', qty: 1 });
    expect(packagingFor('Poliz', 3500)).toEqual({ type: 'tonna', uom: 'TN', qty: 3.5, unitKg: 1000 });
  });
  it("escrow muhri: HELD — «TO'LANGAN / ESCROW HELD»; boshqa holatlar ham aniq", () => {
    expect(escrowStamp('HELD')).toMatchObject({ stamp: "TO'LANGAN / ESCROW HELD", tone: 'green' });
    expect(escrowStamp('RELEASED').stamp).toContain('PAID');
    expect(escrowStamp('PENDING')).toMatchObject({ tone: 'amber' });
    expect(escrowStamp('REFUNDED').tone).toBe('red');
    expect(escrowStamp(null).status).toBe('NONE');
  });
  it("elektron imzo: PIN bo'lsa PIN-VERIFIED; PIN'siz yuklar holat bo'yicha; aks holda kutilmoqda", () => {
    const at = new Date('2026-10-27T10:00:00Z');
    expect(signatureOf('A', at, null, 'x')).toEqual({ printedName: 'A', confirmed: true, method: 'PIN-VERIFIED', at });
    expect(signatureOf('A', null, at, 'CONFIRMED (status)')).toMatchObject({ confirmed: true, method: 'CONFIRMED (status)' });
    expect(signatureOf('A', null, null, 'x')).toMatchObject({ confirmed: false, method: 'AWAITING PIN', at: null });
  });
  it("pul formati: bo'sh joy bilan ajratilgan, tiyinsiz", () => {
    expect(fmtMoney(7755800)).toBe("7 755 800 so'm");
  });
});

describe('BOL & Invoice: PDF chizish (blok, jadval va QR)', () => {
  async function sample(payer: 'BUYER' | 'FARMER' = 'BUYER'): Promise<BolData> {
    const inc = incotermOf(payer), pk = packagingFor('Sabzavot', 2500);
    const party = (name: string) => ({ name, address: "Dehqon ko'chasi 5", cityStateZip: 'Urgut, Samarqand', phone: '+998901112233', stir: '123456789' });
    return {
      bolNumber: 'AGB2B-2026-000123', printDate: new Date(), issuedAt: new Date(), verifyCode: 'ABCDE-12345-FGHIJ-67890', qr: await QRCode.toBuffer('AGRARGO|BOL|x|y', { margin: 1, width: 120 }),
      shipFrom: party('Agro T'), shipTo: party('Korzinka'), billTo: party('Korzinka'), billingInstructions: 'Pay via AgrarGo Escrow.',
      carrier: { name: 'Hasan Haydovchi', license: 'AB1234567', vehicle: 'Isuzu', plate: '01A123BC', phone: '+998907776655' },
      ids: { shipmentId: '81029558', orderRef: 'BK-0F3A9C21', pickupAt: new Date(), deliveredAt: new Date(), status: 'Yetkazilgan', source: 'B2B booking', custRef: 'ref' },
      incoterm: { code: inc.code, label: inc.label, payer, terms: inc.terms },
      instructions: ['Route'], summary: { packages: pk.qty, totalWeightKg: 2500, commodity: 'Pomidor', category: 'Sabzavot' },
      items: [{ orderNo: 'BK-0F3A9C21', itemNo: '0F3A9C21', qty: pk.qty, uom: pk.uom, packageType: pk.type, description: 'Pomidor', unitPrice: 3000, amount: 7_500_000 }],
      totals: { product: 7_500_000, freight: 179_000, service: 76_800, total: 7_755_800, farmerNet: payer === 'FARMER' ? 7_321_000 : null, freightPaidBy: payer === 'FARMER' ? 'Farmer (Prepaid)' : 'Buyer (Collect)' },
      escrow: escrowStamp('HELD'),
      signatures: { shipper: signatureOf('Ali', new Date(), null, 'x'), carrier: signatureOf('Hasan', new Date(), null, 'x'), consignee: signatureOf('Sardor', null, null, 'x') },
    };
  }
  const render = (d: BolData, lang: 'uz' | 'ru' | 'en' = 'en') => new Promise<{ pdf: Buffer; texts: string[]; images: number }>((resolve, reject) => {
    const texts: string[] = [];
    let images = 0;
    const origText = PDFDocument.prototype.text, origImage = PDFDocument.prototype.image;
    (PDFDocument.prototype as any).text = function (t: any, ...a: any[]) { texts.push(String(t)); return origText.call(this, t, ...a); };
    (PDFDocument.prototype as any).image = function (...a: any[]) { images++; return origImage.apply(this, a as any); };
    const doc = newDoc('t', lang);
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('error', reject);
    doc.on('end', () => { PDFDocument.prototype.text = origText; PDFDocument.prototype.image = origImage; resolve({ pdf: Buffer.concat(chunks), texts, images }); });
    try { renderBol(doc, d); doc.end(); } catch (e) { PDFDocument.prototype.text = origText; PDFDocument.prototype.image = origImage; reject(e); }
  });

  it("shablon bloklari: SHIP FROM/TO, BILL TO, SPECIAL INSTRUCTIONS, SHIPMENT SUMMARY, ITEM jadvali, SHIPPER/CARRIER/CONSIGNEE; 1 sahifa; QR bitta", async () => {
    const { pdf, texts, images } = await render(await sample());
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect((pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBe(1);
    const all = texts.join('\n');
    for (const t of ['BILL OF LADING & INVOICE', 'Page 1 of 1', 'SHIP FROM', 'SHIP TO', 'BILL TO', 'SPECIAL INSTRUCTIONS & INCOTERMS', 'SHIPMENT SUMMARY INFORMATION', 'CARRIER ITEM TABLE', 'SHIPPER (FERMER)', 'CARRIER (HAYDOVCHI)', 'CONSIGNEE (MARKET)', 'Freight Charge Terms', 'Bill of Lading #:', 'AGB2B-2026-000123']) {
      expect(all).toContain(t);
    }
    expect(images).toBe(1); // QR-kod
    // jadval: ustunlar va qiymatlar (yashik, birlik narxi, summa)
    for (const t of ['ORDER NO', 'QTY', 'UOM (PACKAGE)', 'ITEM DESCRIPTION', 'UNIT PRICE', 'AMOUNT', 'YASHIK (yashik)', "3 000 so'm/kg", "7 500 000 so'm", '125']) expect(all).toContain(t);
    // escrow muhri va imzolar
    expect(all).toContain("TO'LANGAN / ESCROW HELD");
    expect(all.match(/PIN-VERIFIED/g)).toHaveLength(2);
    expect(all).toContain('AWAITING PIN');
    // hisob-faktura jami
    expect(all).toContain("7 755 800 so'm");
    expect(all).not.toContain('Farmer net');
  });

  it("FERMER to'lasa: Prepaid belgilanadi, 'Farmer net' qatori chiqadi", async () => {
    const { texts } = await render(await sample('FARMER'));
    const all = texts.join('\n');
    expect(all).toContain('Farmer net');
    expect(all).toContain("7 321 000 so'm");
    expect(all).toContain('Farmer (Prepaid)');
    expect(all).toContain('✔'); // Prepaid katagi belgilangan
  });

  it("uzun nomlar sahifani buzmaydi (hali ham 1 sahifa)", async () => {
    const d = await sample();
    d.shipFrom.name = 'Juda uzun xo\'jalik nomi '.repeat(12); d.items[0].description = 'Uzun tavsif '.repeat(30);
    const { pdf } = await render(d);
    expect((pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBe(1);
  });

  it("til: uz va ru hujjat to'liq tarjima qilinadi, 1 sahifa, inglizcha sarlavhalar qolmaydi", async () => {
    const uz = await render(await sample(), 'uz');
    const ru = await render(await sample('FARMER'), 'ru');
    for (const r of [uz, ru]) expect((r.pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBe(1);
    const u = uz.texts.join('\n'), r = ru.texts.join('\n');
    for (const t of ['YUK TASHISH SHARTNOMASI VA HISOB-FAKTURA', 'YUBORUVCHI (FERMER)', 'QABUL QILUVCHI (MARKET)', 'TASHUVCHI (HAYDOVCHI)', 'PIN-VERIFIED ELEKTRON IMZO', 'PIN KUTILMOQDA']) expect(u).toContain(t);
    for (const t of ['BILL OF LADING & INVOICE', 'SHIP FROM', 'CARRIER ITEM TABLE', 'AWAITING PIN']) expect(u).not.toContain(t);
    for (const t of ['ТРАНСПОРТНАЯ НАКЛАДНАЯ И СЧЁТ-ФАКТУРА', 'ОТПРАВИТЕЛЬ (ФЕРМЕР)', 'ПОЛУЧАТЕЛЬ (МАГАЗИН)', 'ПЕРЕВОЗЧИК (ВОДИТЕЛЬ)', 'PIN-ПОДТВЕРЖДЕНО (ЭЛ. ПОДПИСЬ)']) expect(r).toContain(t);
    expect(r).not.toContain("so'm");
    if (process.env.BOL_SAMPLE_DIR) { require('fs').writeFileSync(process.env.BOL_SAMPLE_DIR + '/uz.pdf', uz.pdf); require('fs').writeFileSync(process.env.BOL_SAMPLE_DIR + '/ru.pdf', ru.pdf); }
  });
});
