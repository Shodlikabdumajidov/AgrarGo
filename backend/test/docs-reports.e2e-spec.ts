import ExcelJS from 'exceljs';
import { approve, bearer, bootApp, book, createAdmin, createProduct, pay, registerDriver, registerFarmer, registerMarket, resetDb, TestApp } from './helpers';


describe('TTN/Chek PDF va Excel hisobotlar (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await bootApp(); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); });

  const get = (path: string, who?: any) => {
    let r = t.http().get(path);
    if (who) r = r.set('Authorization', bearer(who));
    return r.buffer(true).parse((res: any, done: any) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => done(null, Buffer.concat(c))); });
  };

  async function scenario() {
    const farmer = await registerFarmer(t.http), market = await registerMarket(t.http), driver = await registerDriver(t.http);
    const product = await createProduct(t.http, farmer);
    const b1 = (await book(t.http, market, product.id, 100)).body;
    expect((await approve(t.http, farmer, b1.id)).status).toBe(200);
    const b2 = (await book(t.http, market, product.id, 50)).body; // to'lovsiz
    await approve(t.http, farmer, b2.id);
    expect((await pay(t.http, market, b1.id)).status).toBe(200);
    const ships = await t.prisma.shipment.findMany({ orderBy: { createdAt: 'asc' } });
    const paid = ships.find((s) => s.bookingId === b1.id)!, unpaid = ships.find((s) => s.bookingId === b2.id)!;
    expect((await t.http().post(`/shipments/${paid.id}/accept`).set('Authorization', bearer(driver))).status).toBe(201);
    return { farmer, market, driver, paid, unpaid };
  }

  it("TTN: ishtirokchilar PDF oladi (%PDF, attachment), begona va tokensiz rad etiladi", async () => {
    const { farmer, market, driver, paid } = await scenario();
    for (const who of [farmer, market, driver]) {
      const r = await get(`/documents/ttn/${paid.id}`, who);
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toBe('application/pdf');
      expect(r.headers['content-disposition']).toMatch(/attachment; filename="TTN-[0-9A-F]{8}\.pdf"/);
      expect(r.body.subarray(0, 5).toString()).toBe('%PDF-');
      expect(r.body.length).toBeGreaterThan(5000);
    }
    const stranger = await registerFarmer(t.http), otherDriver = await registerDriver(t.http);
    expect((await get(`/documents/ttn/${paid.id}`, stranger)).status).toBe(403);
    expect((await get(`/documents/ttn/${paid.id}`, otherDriver)).status).toBe(403);
    expect((await get(`/documents/ttn/${paid.id}`)).status).toBe(401);
    expect((await get(`/documents/ttn/00000000-0000-4000-8000-000000000000`, await createAdmin(t))).status).toBe(404);
    expect((await get(`/documents/ttn/${paid.id}`, await createAdmin(t))).status).toBe(200); // admin ham ko'ra oladi
  });

  it("Chek: faqat to'lov boshlangan yukka; to'lovsiz 404", async () => {
    const { farmer, market, paid, unpaid } = await scenario();
    for (const who of [farmer, market]) {
      const r = await get(`/documents/receipt/${paid.id}`, who);
      expect(r.status).toBe(200);
      expect(r.body.subarray(0, 5).toString()).toBe('%PDF-');
    }
    // to'lov PENDING holatida ham mavjud (bron tasdiqlanganda yaratiladi) -> chek beriladi; payment umuman yo'q yukda 404
    await t.prisma.payment.deleteMany({ where: { bookingId: unpaid.bookingId! } });
    expect((await get(`/documents/receipt/${unpaid.id}`, market)).status).toBe(404);
  });

  it("ommaviy tekshiruv: to'g'ri kod valid, buzilgan kod yoki boshqa hujjat turi invalid; shaxsiy ma'lumot yo'q", async () => {
    const { paid } = await scenario();
    const svc: any = t.app.get(require('../src/documents/documents.service').DocumentsService);
    const pay = await t.prisma.payment.findFirst({ where: { bookingId: paid.bookingId! } });
    const code = svc.sign('ttn', paid, pay!.amount);
    const ok = await t.http().get(`/documents/verify/ttn/${paid.id}/${code.match(/.{1,5}/g).join('-')}`);
    expect(ok.body).toMatchObject({ valid: true, kind: 'ttn', cargoName: 'Pomidor' });
    expect(JSON.stringify(ok.body)).not.toMatch(/phone|fullName|farm/i);
    expect((await t.http().get(`/documents/verify/ttn/${paid.id}/${'0'.repeat(20)}`)).body.valid).toBe(false);
    expect((await t.http().get(`/documents/verify/receipt/${paid.id}/${code}`)).body.valid).toBe(false);
    expect((await t.http().get(`/documents/verify/xyz/${paid.id}/${code}`)).body.valid).toBe(false);
  });

  it("Market Excel: sheetlar, summalar, escrow; boshqa rollar 403; noto'g'ri oy 400", async () => {
    const { farmer, market } = await scenario();
    const r = await get('/reports/market.xlsx?month=all', market);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('spreadsheetml');
    expect(r.headers['content-disposition']).toMatch(/\.xlsx"/);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(r.body);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Xulosa', 'Bronlar', "To'lovlar", 'Ombor buyurtmalari']);
    const sum: Record<string, any> = {};
    wb.getWorksheet('Xulosa')!.eachRow((row) => { sum[String(row.getCell(1).value)] = row.getCell(2).value; });
    expect(sum['Bronlar soni']).toBe(2);
    expect(sum["Escrow'dagi mablag', so'm"]).toBe(100 * 4500);
    expect(wb.getWorksheet("To'lovlar")!.rowCount).toBe(3); // sarlavha + 2 to'lov
    expect((await get('/reports/market.xlsx', farmer)).status).toBe(403);
    expect((await get('/reports/market.xlsx?month=2020-13', market)).status).toBe(400);
    const empty = await get('/reports/market.xlsx?month=2001-01', market);
    const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(empty.body);
    expect(wb2.getWorksheet('Bronlar')!.rowCount).toBe(1);
  });

  it("Admin Excel: tranzaksiyalar, foydalanuvchilar, obuna to'lovlari; formula-inyeksiyadan himoya; faqat admin", async () => {
    const { market } = await scenario();
    const evil = await registerFarmer(t.http, { farmName: '=HYPERLINK("http://evil","x")' });
    await t.http().post('/subscription/pay').set('Authorization', bearer(market)).send({ months: 3 });
    const admin = await createAdmin(t);
    const r = await get('/reports/admin.xlsx', admin);
    expect(r.status).toBe(200);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(r.body);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Xulosa', 'Tranzaksiyalar', 'Tranzaksiya tarixi', 'Foydalanuvchilar', "Obuna to'lovlari"]);
    expect(wb.getWorksheet('Tranzaksiyalar')!.rowCount).toBe(3);
    expect(wb.getWorksheet("Obuna to'lovlari")!.getRow(2).getCell(6).value).toBe(149000 * 3);
    const orgs: string[] = []; wb.getWorksheet('Foydalanuvchilar')!.eachRow((row, i) => { if (i > 1) orgs.push(String(row.getCell(5).value)); });
    expect(orgs).toContain(`'=HYPERLINK("http://evil","x")`);
    expect(orgs.some((o) => o.startsWith('='))).toBe(false);
    expect((await get('/reports/admin.xlsx', market)).status).toBe(403);
    expect((await get('/reports/admin.xlsx', evil)).status).toBe(403);
    expect((await get('/reports/admin.xlsx?from=bad', admin)).status).toBe(400);
    expect((await get('/reports/admin.xlsx?from=2030-01-01&to=2030-01-02', admin)).status).toBe(200);
  });
});
