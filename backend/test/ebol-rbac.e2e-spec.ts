import { SMS_PROVIDER } from '../src/sms/sms-provider';
import {
  Account, approve, bearer, book, bootApp, createAdmin, createProduct, pay, registerConsumer, registerDriver, registerFarmer, registerMarket, resetDb, TestApp,
} from './helpers';

type Sub = { to: string; text: string };

async function boot(env: Record<string, string> = {}) {
  const t = await bootApp(env);
  const sent: Sub[] = [];
  const sms: any = t.app.get(SMS_PROVIDER);
  sms.send = async (to: string, text: string) => { sent.push({ to, text }); };
  const codeOf = () => /kodi (\d{4})/.exec(sent[sent.length - 1].text)![1];
  return { t, sent, codeOf };
}

const sendAs = (t: TestApp) => (m: 'get' | 'post' | 'patch', who: Account | null, path: string, body?: any) =>
  (who ? t.http()[m](path).set('Authorization', bearer(who)) : t.http()[m](path)).send(body);

describe('RBAC (e2e)', () => {
  let t: TestApp;
  let send: ReturnType<typeof sendAs>;
  beforeAll(async () => { t = (await boot()).t; send = sendAs(t); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); });

  it('panel ruxsatlari: har bir admin roli faqat o\'z bo\'limiga kiradi, SUPER_ADMIN hammasiga', async () => {
    const [sup, safety, fin, hub] = await Promise.all([
      createAdmin(t, 'ADMIN', 'SUPER_ADMIN'), createAdmin(t, 'ADMIN', 'SAFETY_ADMIN'), createAdmin(t, 'ADMIN', 'FINANCE_ADMIN'), createAdmin(t, 'ADMIN', 'HUB_ADMIN'),
    ]);
    const status = async (who: Account, path: string) => (await send('get', who, path)).status;
    // [yo'l, ruxsat etilgan rol]
    const matrix: [string, Account][] = [['/safety/summary', safety], ['/kyc/pending', safety], ['/payments', fin], ['/hub/stock', hub]];
    for (const [path, allowed] of matrix) {
      expect(await status(sup, path)).toBe(200);
      for (const who of [safety, fin, hub]) expect([path, who.user.adminRole, await status(who, path)]).toEqual([path, who.user.adminRole, who === allowed ? 200 : 403]);
    }
    // /admin/* (foydalanuvchilar, jurnal, sozlamalar) faqat SUPER_ADMIN
    for (const who of [safety, fin, hub]) {
      expect(await status(who, '/admin/users')).toBe(403);
      expect(await status(who, '/admin/audit')).toBe(403);
    }
    expect(await status(sup, '/admin/users')).toBe(200);
  });

  it('oddiy foydalanuvchi va dispetcher admin panelga kira olmaydi; adminRole USER (standart)', async () => {
    const farmer = await registerFarmer(t.http);
    const disp = await createAdmin(t, 'DISPATCHER');
    expect(farmer.user.adminRole).toBe('USER');
    expect(disp.user.adminRole).toBe('USER');
    for (const who of [farmer, disp]) expect((await send('get', who, '/safety/summary')).status).toBe(403);
    expect((await send('get', null, '/safety/summary')).status).toBe(401);
  });

  it('xodim yaratishda adminRole majburiy; boshqaruv faqat SUPER_ADMIN; oxirgi superadminni tushirib bo\'lmaydi', async () => {
    const sup = await createAdmin(t, 'ADMIN', 'SUPER_ADMIN');
    const body = { phone: '+998905551111', password: 'Xodim-Parol-2026', fullName: 'Safety Xodim', role: 'ADMIN' };
    expect((await send('post', sup, '/admin/staff', body)).status).toBe(400);
    expect((await send('post', sup, '/admin/staff', { ...body, adminRole: 'USER' })).status).toBe(400);
    const ok = await send('post', sup, '/admin/staff', { ...body, adminRole: 'SAFETY_ADMIN' });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ role: 'ADMIN', adminRole: 'SAFETY_ADMIN' });
    const login = await t.http().post('/auth/login').send({ phone: body.phone, password: body.password });
    expect(login.body.user.adminRole).toBe('SAFETY_ADMIN');

    const safety: Account = { token: login.body.accessToken, user: login.body.user, phone: body.phone };
    expect((await send('patch', safety, `/admin/users/${safety.user.id}/admin-role`, { adminRole: 'SUPER_ADMIN' })).status).toBe(403);
    expect((await send('patch', sup, `/admin/users/${sup.user.id}/admin-role`, { adminRole: 'HUB_ADMIN' })).status).toBe(409); // o'zi
    const changed = await send('patch', sup, `/admin/users/${safety.user.id}/admin-role`, { adminRole: 'FINANCE_ADMIN' });
    expect(changed.body.adminRole).toBe('FINANCE_ADMIN');
    expect((await send('get', safety, '/safety/summary')).status).toBe(401); // eski sessiya yopiladi (yangi huquqlar bilan qayta kirish)

    const farmer = await registerFarmer(t.http);
    expect((await send('patch', sup, `/admin/users/${farmer.user.id}/admin-role`, { adminRole: 'HUB_ADMIN' })).status).toBe(400);
    // dispetcherga adminRole berilmaydi, bazada CHECK ham himoya qiladi
    await expect(t.prisma.user.update({ where: { id: farmer.user.id }, data: { adminRole: 'SAFETY_ADMIN' } })).rejects.toBeDefined();
    // oxirgi faol superadminni bloklab ham, tushirib ham bo'lmaydi
    const sup2 = await createAdmin(t, 'ADMIN', 'SUPER_ADMIN');
    expect((await send('patch', sup2, `/admin/users/${sup.user.id}/admin-role`, { adminRole: 'HUB_ADMIN' })).status).toBe(200);
    expect((await send('patch', sup2, `/admin/users/${sup2.user.id}/admin-role`, { adminRole: 'HUB_ADMIN' })).status).toBe(409);
  });
});

describe('e-BOL: yuk (Shipment)', () => {
  let t: TestApp, sent: Sub[], codeOf: () => string, send: ReturnType<typeof sendAs>;
  beforeAll(async () => { ({ t, sent, codeOf } = await boot()); send = sendAs(t); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); sent.length = 0; });

  async function loading() {
    const farmer = await registerFarmer(t.http), market = await registerMarket(t.http), driver = await registerDriver(t.http);
    const product = await createProduct(t.http, farmer, { quantityKg: 10000 });
    const b = (await book(t.http, market, product.id, 500)).body;
    await approve(t.http, farmer, b.id);
    await pay(t.http, market, b.id);
    const id = (await t.prisma.shipment.findFirstOrThrow()).id;
    expect((await send('post', driver, `/shipments/${id}/accept`)).status).toBe(201);
    return { farmer, market, driver, id };
  }

  it('yetib keldi -> kod fermer telefoniga ketadi (hash saqlanadi) -> kod bilan imzo: isSigned, EBolContract, IN_TRANSIT', async () => {
    const w = await loading();
    const o = await send('post', w.driver, `/shipments/${w.id}/arrived`);
    expect(o.status).toBe(200);
    expect(JSON.stringify(o.body)).not.toMatch(/\d{4}"/); // kod javobda yo'q
    expect(o.body.phone).toMatch(/\*\*\*/);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(w.farmer.phone);
    const code = codeOf();
    const row = await t.prisma.shipment.findUniqueOrThrow({ where: { id: w.id } });
    expect(row.pickupOtp).not.toBe(code);
    expect(row.pickupOtp).toMatch(/^[0-9a-f]{64}$/);

    expect((await send('post', w.driver, `/shipments/${w.id}/sign`, { code: code === '0000' ? '1111' : '0000' })).status).toBe(400);
    expect((await send('post', w.driver, `/shipments/${w.id}/sign`, { code: '12' })).status).toBe(400);
    const done = await send('post', w.driver, `/shipments/${w.id}/sign`, { code });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ status: 'IN_TRANSIT', isSigned: true });
    expect(done.body.events.map((e: any) => e.status)).toEqual(['OPEN', 'LOADING', 'IN_TRANSIT']);

    const after = await t.prisma.shipment.findUniqueOrThrow({ where: { id: w.id } });
    expect(after).toMatchObject({ isSigned: true, pickupOtp: null, pickupOtpExpiresAt: null });
    const contract = await t.prisma.eBolContract.findUniqueOrThrow({ where: { shipmentId: w.id } });
    expect(contract).toMatchObject({ status: 'SIGNED', driverId: (await t.prisma.driver.findFirstOrThrow()).id });
    expect(contract.contractHash).toMatch(/^[0-9a-f]{64}$/);
    // qayta imzolab bo'lmaydi; keyingi bosqich (yetkazish) oddiy advance bilan
    expect((await send('post', w.driver, `/shipments/${w.id}/sign`, { code })).status).toBe(409);
    expect((await send('post', w.driver, `/shipments/${w.id}/arrived`)).status).toBe(409);
    expect((await send('patch', w.driver, `/shipments/${w.id}/advance`)).body.status).toBe('DELIVERED');
  });

  it("begona haydovchi/rol kira olmaydi; kodsiz, muddati o'tgan va 5 marta noto'g'ri kod bloklanadi; qayta yuborish 60 s kutadi", async () => {
    const w = await loading();
    const other = await registerDriver(t.http);
    expect((await send('post', other, `/shipments/${w.id}/arrived`)).status).toBe(404);
    expect((await send('post', w.farmer, `/shipments/${w.id}/arrived`)).status).toBe(403);
    expect((await send('post', w.driver, `/shipments/${w.id}/sign`, { code: '1234' })).status).toBe(400); // avval kod yuborilmagan

    await send('post', w.driver, `/shipments/${w.id}/arrived`);
    expect((await send('post', w.driver, `/shipments/${w.id}/arrived`)).status).toBe(429); // cooldown
    const code = codeOf();
    const wrong = code === '0000' ? '1111' : '0000';
    for (let i = 0; i < 5; i++) expect((await send('post', w.driver, `/shipments/${w.id}/sign`, { code: wrong })).status).toBe(400);
    expect((await send('post', w.driver, `/shipments/${w.id}/sign`, { code })).status).toBe(429); // to'g'ri kod ham bloklangan
    expect(await t.prisma.eBolContract.count()).toBe(0);

    // cooldown o'tgach yangi kod: urinishlar nolga qaytadi, eski kod yaroqsiz
    await t.prisma.shipment.update({ where: { id: w.id }, data: { pickupOtpExpiresAt: new Date(Date.now() + 15 * 60_000 - 61_000) /* 61 s oldin yuborilgan */ } });
    expect((await send('post', w.driver, `/shipments/${w.id}/arrived`)).status).toBe(200);
    const fresh = codeOf();
    if (fresh !== code) expect((await send('post', w.driver, `/shipments/${w.id}/sign`, { code })).status).toBe(400);
    await t.prisma.shipment.update({ where: { id: w.id }, data: { pickupOtpExpiresAt: new Date(Date.now() - 1000) } });
    expect((await send('post', w.driver, `/shipments/${w.id}/sign`, { code: fresh })).body.message).toMatch(/muddati/);
  });

  it('EBOL_ENFORCE o\'chiq: mavjud oqim (advance) o\'zgarishsiz ishlaydi', async () => {
    const w = await loading();
    const r = await send('patch', w.driver, `/shipments/${w.id}/advance`);
    expect(r.body).toMatchObject({ status: 'IN_TRANSIT', isSigned: false, ebolRequired: false });
  });
});

describe('e-BOL: EBOL_ENFORCE=true', () => {
  let t: TestApp, send: ReturnType<typeof sendAs>;
  beforeAll(async () => { ({ t } = await boot({ EBOL_ENFORCE: 'true' })); send = sendAs(t); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); });

  it("imzosiz yo'lga chiqib bo'lmaydi", async () => {
    const farmer = await registerFarmer(t.http), market = await registerMarket(t.http), driver = await registerDriver(t.http);
    const product = await createProduct(t.http, farmer, { quantityKg: 10000 });
    const b = (await book(t.http, market, product.id, 500)).body;
    await approve(t.http, farmer, b.id); await pay(t.http, market, b.id);
    const id = (await t.prisma.shipment.findFirstOrThrow()).id;
    const acc = await send('post', driver, `/shipments/${id}/accept`);
    expect(acc.body.ebolRequired).toBe(true);
    expect((await send('patch', driver, `/shipments/${id}/advance`)).status).toBe(409);
    expect((await t.prisma.shipment.findUniqueOrThrow({ where: { id } })).status).toBe('LOADING');
  });
});

describe('e-BOL: mahalliy buyurtma (LocalOrder) va Safety panel', () => {
  let t: TestApp, sent: Sub[], codeOf: () => string, send: ReturnType<typeof sendAs>;
  beforeAll(async () => { ({ t, sent, codeOf } = await boot()); send = sendAs(t); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); sent.length = 0; });

  it("kuryer imzosi shartnoma yozadi; Safety admin ro'yxatni vaqt va ID bilan ko'radi, boshqa rollar ko'rmaydi", async () => {
    const admin = await createAdmin(t, 'ADMIN'), staff = await createAdmin(t, 'DISPATCHER'), safety = await createAdmin(t, 'ADMIN', 'SAFETY_ADMIN');
    const hub = (await send('post', admin, '/hubs', { name: 'Samarqand Hub', region: 'Samarqand' })).body;
    await send('post', admin, `/hubs/${hub.id}/staff`, { userId: staff.user.id });
    const farmer = await registerFarmer(t.http, { region: 'Qashqadaryo' });
    const product = await createProduct(t.http, farmer, { name: 'Kartoshka', category: 'Sabzavot', quantityKg: 1000, pricePerKg: 3000 });
    const intake = (await send('post', farmer, '/hub/intakes', { productId: product.id, hubId: hub.id, declaredKg: 500, retailPricePerKg: 4000, minOrderKg: 10 })).body;
    await send('post', staff, `/hub/intakes/${intake.id}/receive`, { receivedKg: 500 });
    const consumer = await registerConsumer(t.http), courier = await registerDriver(t.http, { region: 'Samarqand' });
    await send('patch', courier, '/local/courier/mode', { enabled: true, hubId: hub.id });
    const o = (await send('post', consumer, '/local/orders', { productId: product.id, quantityKg: 20, district: 'Siyob', address: 'Registon 10' })).body;
    // tayyor bo'lmagan buyurtmada e-BOL yo'q
    expect((await send('post', courier, `/local/orders/${o.id}/ebol/otp`)).status).toBe(404);
    await send('post', staff, `/local/orders/${o.id}/pack-start`, {}); await send('post', staff, `/local/orders/${o.id}/packed`, {});
    await send('post', courier, `/local/orders/${o.id}/accept`, {});

    expect((await send('post', courier, `/local/orders/${o.id}/ebol/otp`)).status).toBe(200);
    expect(sent[0].to).toBe(farmer.phone);
    expect((await send('post', courier, `/local/orders/${o.id}/ebol/sign`, { code: '0000' === codeOf() ? '1111' : '0000' })).status).toBe(400);
    const signed = await send('post', courier, `/local/orders/${o.id}/ebol/sign`, { code: codeOf() });
    expect(signed.body).toMatchObject({ status: 'DELIVERING', isSigned: true });
    expect((await send('post', courier, `/local/orders/${o.id}/ebol/otp`)).status).toBe(409);
    // oqim davom etadi
    expect((await send('post', courier, `/local/orders/${o.id}/deliver`, { code: o.deliveryCode })).body.status).toBe('COMPLETED');

    // Safety panel
    const sum = await send('get', safety, '/safety/summary');
    expect(sum.body).toMatchObject({ pendingUsers: expect.any(Number), signedTotal: 1, signedToday: 1 });
    const list = await send('get', safety, '/safety/ebol');
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    const item = list.body.items[0];
    expect(item).toMatchObject({ kind: 'LOCAL', localOrderId: o.id, status: 'SIGNED', farmer: { phone: farmer.phone }, driver: { phone: courier.phone } });
    expect(new Date(item.signedAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(item.id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await send('get', safety, `/safety/ebol/${item.id}`)).body.id).toBe(item.id);
    expect((await send('get', safety, '/safety/ebol?kind=SHIPMENT')).body.total).toBe(0);
    expect((await send('get', safety, '/safety/ebol?kind=BAD')).status).toBe(400);
    for (const who of [farmer, courier, staff, consumer]) expect((await send('get', who, '/safety/ebol')).status).toBe(403);
    expect((await send('get', await createAdmin(t, 'ADMIN', 'FINANCE_ADMIN'), '/safety/ebol')).status).toBe(403);
  });
});
