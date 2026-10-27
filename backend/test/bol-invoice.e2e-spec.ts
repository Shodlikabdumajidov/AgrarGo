import PDFDocument from 'pdfkit';
import { DocumentsService } from '../src/documents/documents.service';
import { Account, approve, bearer, book, bootApp, createAdmin, createProduct, pay, registerDriver, registerFarmer, registerMarket, resetDb, TestApp } from './helpers';

describe('BOL & Invoice PDF (Amerika B2B BOL shakli) (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await bootApp({ PIN_ENFORCE: 'true' }); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); });

  const get = (path: string, who?: Account) => {
    let r = t.http().get(path);
    if (who) r = r.set('Authorization', bearer(who));
    return r.buffer(true).parse((res: any, done: any) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => done(null, Buffer.concat(c))); });
  };
  /** PDF ichidagi matn/rasm chaqiruvlarini ushlaydi (pdfkit matnni siqilgan shriftda saqlaydi) */
  async function capture<T>(fn: () => Promise<T>) {
    const texts: string[] = [];
    let images = 0;
    const origText = PDFDocument.prototype.text, origImage = PDFDocument.prototype.image;
    (PDFDocument.prototype as any).text = function (s: any, ...a: any[]) { texts.push(String(s)); return origText.call(this, s, ...a); };
    (PDFDocument.prototype as any).image = function (...a: any[]) { images++; return origImage.apply(this, a as any); };
    try { return { res: await fn(), all: () => texts.join('\n'), images }; } finally { PDFDocument.prototype.text = origText; PDFDocument.prototype.image = origImage; }
  }

  async function scenario(opts: { deliveryPayer?: 'BUYER' | 'FARMER'; payIt?: boolean } = {}) {
    const farmer = await registerFarmer(t.http, { stir: undefined }), market = await registerMarket(t.http), driver = await registerDriver(t.http, { capacityKg: 30000 });
    const product = await createProduct(t.http, farmer, { name: 'Pomidor', category: 'Sabzavot', quantityKg: 20000, pricePerKg: 3000, ...(opts.deliveryPayer && { deliveryPayer: opts.deliveryPayer }) });
    const bk = (await book(t.http, market, product.id, 2500)).body;
    await approve(t.http, farmer, bk.id);
    if (opts.payIt !== false) await pay(t.http, market, bk.id);
    const ship = await t.prisma.shipment.findFirstOrThrow({ where: { bookingId: bk.id } });
    const staff = await createAdmin(t, 'DISPATCHER'), admin = await createAdmin(t, 'ADMIN');
    return { farmer, market, driver, product, bk, ship, staff, admin };
  }
  const deliver = async (w: Awaited<ReturnType<typeof scenario>>) => {
    await t.http().post(`/shipments/${w.ship.id}/accept`).set('Authorization', bearer(w.driver));
    const pins = await t.prisma.shipment.findUniqueOrThrow({ where: { id: w.ship.id } });
    await t.http().post(`/shipments/${w.ship.id}/confirm-pickup`).set('Authorization', bearer(w.farmer)).send({ pin: pins.pickupPin });
    await t.http().post(`/shipments/${w.ship.id}/deliver`).set('Authorization', bearer(w.driver)).send({ pin: pins.deliveryPin });
  };

  it("hujjat bron tasdiqlangandan boshlab mavjud: barcha ishtirokchilar, dispetcher va admin oladi; begona va tokensiz rad etiladi", async () => {
    const w = await scenario();
    const paths = [`/documents/bol/${w.ship.id}`, `/orders/${w.bk.id}/bol.pdf`, `/orders/${w.bk.id}/invoice.pdf`, `/orders/${w.ship.id}/bol.pdf`];
    for (const who of [w.farmer, w.market, w.staff, w.admin]) {
      for (const p of paths) {
        const r = await get(p, who);
        expect(r.status).toBe(200);
        expect(r.headers['content-type']).toBe('application/pdf');
        expect(r.body.subarray(0, 5).toString()).toBe('%PDF-');
        expect(r.body.length).toBeGreaterThan(8000);
      }
    }
    // haydovchi biriktirilgach ham oladi; biriktirilmagan haydovchi — yo'q
    await t.http().post(`/shipments/${w.ship.id}/accept`).set('Authorization', bearer(w.driver));
    expect((await get(`/orders/${w.bk.id}/bol.pdf`, w.driver)).status).toBe(200);
    const other = await registerDriver(t.http), strangerFarmer = await registerFarmer(t.http), strangerMarket = await registerMarket(t.http);
    for (const x of [other, strangerFarmer, strangerMarket]) expect((await get(`/orders/${w.bk.id}/bol.pdf`, x)).status).toBe(403);
    expect((await get(`/orders/${w.bk.id}/bol.pdf`)).status).toBe(401);
    expect((await get(`/orders/not-a-uuid/bol.pdf`, w.farmer)).status).toBe(400);
    expect((await get(`/orders/11111111-1111-4111-8111-111111111111/bol.pdf`, w.farmer)).status).toBe(404);
  });

  it("brauzerda ochiladi (inline) va yuklab olinadi (attachment): sarlavhalar va fayl nomi", async () => {
    const w = await scenario();
    const id8 = w.bk.id.slice(0, 8).toUpperCase();
    expect((await get(`/orders/${w.bk.id}/bol.pdf`, w.market)).headers['content-disposition']).toBe(`inline; filename="BOL-${id8}.pdf"`);
    expect((await get(`/orders/${w.bk.id}/invoice.pdf`, w.market)).headers['content-disposition']).toBe(`inline; filename="Invoice-${id8}.pdf"`);
    expect((await get(`/orders/${w.bk.id}/bol.pdf?download=1`, w.market)).headers['content-disposition']).toMatch(/^attachment; filename="BOL-/);
    expect((await get(`/documents/bol/${w.ship.id}`, w.market)).headers['content-disposition']).toMatch(/^attachment/);
    expect((await get(`/documents/bol/${w.ship.id}?inline=1`, w.market)).headers['content-disposition']).toMatch(/^inline/);
    expect((await get(`/orders/${w.bk.id}/bol.pdf`, w.market)).headers['cache-control']).toBe('no-store');
  });

  it("mazmun: BOL raqami (AGB2B-YYYY-NNNNNN), QR-kod, bloklar, jadval, ESCROW HELD muhri, XARIDOR to'lovchi (FCA/Collect), PIN imzo kutilmoqda", async () => {
    const w = await scenario();
    const c = await capture(() => get(`/orders/${w.bk.id}/bol.pdf`, w.market));
    const all = c.all();
    expect(c.res.status).toBe(200);
    expect(c.images).toBe(1); // QR
    const ship = await t.prisma.shipment.findUniqueOrThrow({ where: { id: w.ship.id } });
    expect(all).toContain(`AGB2B-${ship.createdAt.getUTCFullYear()}-${String(ship.bolNo).padStart(6, '0')}`);
    for (const x of ['SHIP FROM', 'SHIP TO', 'BILL TO', 'SPECIAL INSTRUCTIONS & INCOTERMS', 'SHIPMENT SUMMARY INFORMATION', 'CARRIER ITEM TABLE', 'SHIPPER (FERMER)', 'CARRIER (HAYDOVCHI)', 'CONSIGNEE (MARKET)']) expect(all).toContain(x);
    expect(all).toContain('Agro'); // fermer
    expect(all).toContain('Korzinka Market');
    expect(all).toContain('Not assigned yet'); // haydovchi hali yo'q
    expect(all).toContain("TO'LANGAN / ESCROW HELD");
    expect(all).toContain('FCA');
    expect(all).toContain('Buyer (Collect)');
    expect(all).toContain('YASHIK (yashik)'); // sabzavot
    expect(all).toContain('125'); // 2500 kg / 20 kg
    expect(all).toContain("3 000 so'm/kg");
    expect(all).toContain("7 500 000 so'm");
    expect(all).toContain('AWAITING PIN');
    expect(all).not.toContain('PIN-VERIFIED');
    // jami = mahsulot + yo'l haqi + xizmat haqi (tizim hisobi bilan bir xil)
    const p = await t.prisma.payment.findFirstOrThrow({ where: { bookingId: w.bk.id } });
    const total = Number(p.amount) + Number(p.deliveryFee) + Number(p.serviceFee);
    expect(all).toContain(`${Math.round(total).toLocaleString('ru-RU').replace(/[  ]/g, ' ')} so'm`);
  });

  it("to'lanmagan buyurtma: «TO'LOV KUTILMOQDA»; PIN bilan yetkazilgach — PIN-VERIFIED imzolar, RELEASED muhri; QR-kod tekshiruvi", async () => {
    const w = await scenario({ payIt: false });
    expect((await capture(() => get(`/orders/${w.bk.id}/bol.pdf`, w.farmer))).all()).toContain("TO'LOV KUTILMOQDA / PAYMENT PENDING");
    await pay(t.http, w.market, w.bk.id);
    await deliver(w);
    const c = await capture(() => get(`/orders/${w.bk.id}/bol.pdf`, w.market));
    const all = c.all();
    expect(all.match(/PIN-VERIFIED/g)).toHaveLength(3); // shipper + carrier (yuklash PIN'i) + consignee (topshirish PIN'i)
    expect(all).not.toContain('AWAITING PIN');
    expect(all).toContain("TO'LANGAN / PAID — RELEASED");
    expect(all).toContain('Hasan'); // haydovchi
    const ship = await t.prisma.shipment.findUniqueOrThrow({ where: { id: w.ship.id } });
    expect(ship.pickupPinVerifiedAt).not.toBeNull();
    expect(ship.deliveryPinVerifiedAt).not.toBeNull();
    // QR-kod: tekshiruv kodi ommaviy endpoint orqali tasdiqlanadi
    const svc = t.app.get(DocumentsService) as any;
    const pay0 = await t.prisma.payment.findFirstOrThrow({ where: { bookingId: w.bk.id } });
    const code = svc.sign('bol', ship, pay0.amount);
    const ok = await t.http().get(`/documents/verify/bol/${ship.id}/${code}`);
    expect(ok.body).toMatchObject({ valid: true, kind: 'bol', cargoName: 'Pomidor', weightKg: 2500 });
    expect(JSON.stringify(ok.body)).not.toMatch(/phone|\+998/);
    expect((await t.http().get(`/documents/verify/bol/${ship.id}/AAAAAAAAAAAAAAAAAAAA`)).body).toEqual({ valid: false });
    expect((await t.http().get(`/documents/verify/ttn/${ship.id}/${code}`)).body).toEqual({ valid: false }); // boshqa turdagi kod mos kelmaydi
  });

  it("FERMER yetkazishni to'lasa: DAP / Prepaid, «Farmer net» qatori; BOL raqamlari har yuk uchun noyob va o'suvchi", async () => {
    const w = await scenario({ deliveryPayer: 'FARMER' });
    const all = (await capture(() => get(`/orders/${w.bk.id}/bol.pdf`, w.farmer))).all();
    expect(all).toContain('DAP');
    expect(all).toContain('Farmer (Prepaid)');
    expect(all).toContain('Farmer net');
    const p = await t.prisma.payment.findFirstOrThrow({ where: { bookingId: w.bk.id } });
    expect(all).toContain(`${Math.round(Number(p.amount)).toLocaleString('ru-RU').replace(/[  ]/g, ' ')} so'm`);
    // ikkinchi yuk: BOL raqami katta
    const bk2 = (await book(t.http, w.market, w.product.id, 100)).body; await approve(t.http, w.farmer, bk2.id);
    const s2 = await t.prisma.shipment.findFirstOrThrow({ where: { bookingId: bk2.id } });
    expect(s2.bolNo).toBeGreaterThan(w.ship.bolNo);
  });

  it("dispetcher bekor qilingan to'lovli buyurtma BOL'ini oladi: VOID muhri", async () => {
    const w = await scenario();
    await t.prisma.payment.updateMany({ where: { bookingId: w.bk.id }, data: { status: 'CANCELLED' } });
    const all = (await capture(() => get(`/orders/${w.bk.id}/bol.pdf`, w.staff))).all();
    expect(all).toContain('BEKOR QILINGAN / VOID');
  });
});
