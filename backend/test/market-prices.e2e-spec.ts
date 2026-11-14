import { bearer, bootApp, createAdmin, registerDriver, registerFarmer, registerMarket, resetDb, TestApp } from './helpers';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const FC = 'Toshkent Food City';

describe('Bozor narxlari (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await bootApp(); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); });

  const add = (who: any, f: Record<string, string>, img?: Buffer) => {
    let r = t.http().post('/market-prices').set('Authorization', bearer(who));
    for (const [k, v] of Object.entries(f)) r = r.field(k, v);
    return img ? r.attach('image', img, 'p.png') : r;
  };
  const list = (who: any, qs = '') => t.http().get('/market-prices' + qs).set('Authorization', bearer(who));

  it("faqat admin va dispetcher kiritadi; boshqa rollar 403, tokensiz 401; hamma ko'ra oladi", async () => {
    const farmer = await registerFarmer(t.http), driver = await registerDriver(t.http), market = await registerMarket(t.http);
    for (const who of [farmer, driver, market]) {
      expect((await add(who, { marketName: FC, productName: 'Kartoshka', priceToday: '5000' })).status).toBe(403);
      expect((await list(who)).status).toBe(200);
    }
    expect((await t.http().get('/market-prices')).status).toBe(401);
    for (const role of ['ADMIN', 'DISPATCHER'] as const) {
      const staff = await createAdmin(t, role);
      expect((await add(staff, { marketName: FC, productName: `Olma ${role}`, priceToday: '5000' })).status).toBe(201);
      expect((await list(staff)).status).toBe(200);
    }
  });

  it("yangi narx oxirgisini priceYesterday ga yozadi; ro'yxatda faqat eng oxirgisi; foiz va yo'nalish", async () => {
    const admin = await createAdmin(t);
    const a = await add(admin, { marketName: FC, productName: 'Kartoshka', priceToday: '5000' });
    expect(a.body).toMatchObject({ priceToday: 5000, priceYesterday: 5000, trend: 'flat', changePercent: 0 });
    const b = await add(admin, { marketName: FC, productName: 'kartoshka', priceToday: '5500' }, PNG);
    expect(b.body).toMatchObject({ priceToday: 5500, priceYesterday: 5000, trend: 'up', changePercent: 10, productName: 'Kartoshka' });
    expect(b.body.image).toMatch(/^\/uploads\/prices\/.+\.png$/);
    const c = await add(admin, { marketName: FC, productName: 'Kartoshka', priceToday: '4950' });
    expect(c.body).toMatchObject({ priceYesterday: 5500, trend: 'down', changePercent: -10 });
    expect(c.body.image).toBe(b.body.image); // rasm yuborilmasa oxirgisi saqlanadi
    // boshqa bozor — alohida tarix
    const d = await add(admin, { marketName: "Qo'yliq dehqon bozori", productName: 'Kartoshka', priceToday: '4000' });
    expect(d.body.priceYesterday).toBe(4000);

    const l = await list(admin);
    expect(l.body).toHaveLength(2);
    expect(l.body.find((x: any) => x.marketName === FC).priceToday).toBe(4950);
    expect((await t.http().get(b.body.image)).status).toBe(200);
  });

  it("qidiruv bozor yoki mahsulot nomi bo'yicha; filtr", async () => {
    const admin = await createAdmin(t);
    await add(admin, { marketName: FC, productName: 'Kartoshka', priceToday: '5000' });
    await add(admin, { marketName: 'Samarqand Siyob dehqon bozori', productName: 'Sabzi', priceToday: '4000' });
    const names = (r: any) => r.body.map((x: any) => x.productName).sort();
    expect(names(await list(admin, '?q=kart'))).toEqual(['Kartoshka']);
    expect(names(await list(admin, '?q=SIYOB'))).toEqual(['Sabzi']);
    expect(names(await list(admin, '?q=food'))).toEqual(['Kartoshka']);
    expect(names(await list(admin, '?q=%25'))).toEqual([]); // % maxsus belgi sifatida talqin qilinmaydi
    expect(names(await list(admin, `?market=${encodeURIComponent(FC)}`))).toEqual(['Kartoshka']);
  });

  it("tekshiruvlar: noma'lum bozor, narx, soxta rasm, katta rasm; bozorlar ro'yxati", async () => {
    const admin = await createAdmin(t);
    expect((await add(admin, { marketName: 'Yo\'q bozor', productName: 'Olma', priceToday: '100' })).status).toBe(400);
    for (const p of ['0', '-5', 'abc', '1.5', '']) expect((await add(admin, { marketName: FC, productName: 'Olma', priceToday: p })).status).toBe(400);
    expect((await add(admin, { marketName: FC, productName: 'O', priceToday: '100' })).status).toBe(400);
    expect((await add(admin, { marketName: FC, productName: 'Olma', priceToday: '100' }, Buffer.from('not an image at all'))).status).toBe(400);
    expect((await add(admin, { marketName: FC, productName: 'Olma', priceToday: '100' }, Buffer.concat([PNG, Buffer.alloc(3.2 * 1024 * 1024)]))).status).toBe(413);
    const m = await t.http().get('/market-prices/markets').set('Authorization', bearer(admin));
    expect(m.body.map((g: any) => g.region)).toEqual(['Toshkent', 'Samarqand', 'Jizzax']);
    expect(m.body.flatMap((g: any) => g.markets)).toHaveLength(8);
  });

  it("bir vaqtdagi ikki kiritish kecha narxini buzmaydi", async () => {
    const admin = await createAdmin(t);
    await add(admin, { marketName: FC, productName: 'Piyoz', priceToday: '3000' });
    const [x, y] = await Promise.all([
      add(admin, { marketName: FC, productName: 'Piyoz', priceToday: '3100' }),
      add(admin, { marketName: FC, productName: 'Piyoz', priceToday: '3200' }),
    ]);
    expect([x.status, y.status]).toEqual([201, 201]);
    expect(new Set([x.body.priceYesterday, y.body.priceYesterday]).size).toBe(2); // zanjir: 3000->a, a->b
  });
});
