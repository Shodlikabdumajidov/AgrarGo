import { TELEGRAM_API } from '../src/telegram/telegram-api';
import { NotificationService } from '../src/telegram/notification.service';
import { approve, bearer, book, bootApp, createProduct, pay, registerDriver, registerFarmer, registerMarket, resetDb, TestApp } from './helpers';

const post = { status: 'AVAILABLE', trailerType: 'DRY_VAN', capacityKg: 10000, routes: ['Samarqand ↔ Toshkent'], currentLocation: 'Samarqand sh.', loadMode: 'LTL' };

describe("Haydovchiga yuk taklifi va aloqa (e2e)", () => {
  let t: TestApp;
  let sent: { chatId: string; text: string }[];
  beforeAll(async () => {
    t = await bootApp({ TELEGRAM_BOT_TOKEN: '1234567890:AAFakeTokenFakeTokenFakeTokenFake_12', TELEGRAM_POLLING: 'false' });
    (t.app.get(TELEGRAM_API) as any).sendMessage = async (chatId: string, text: string) => { sent.push({ chatId, text }); };
  });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); sent = []; });

  const send = (m: 'get' | 'post' | 'patch', who: any, path: string, body?: any) => t.http()[m](path).set('Authorization', bearer(who)).send(body);

  async function world() {
    const driver = await registerDriver(t.http, { capacityKg: 20000 }), farmer = await registerFarmer(t.http), market = await registerMarket(t.http);
    const p = (await send('post', driver, '/driver-posts', post)).body;
    const product = await createProduct(t.http, farmer, { quantityKg: 60000, pricePerKg: 1000, name: 'Pomidor' });
    const load = async (kg: number, paid = true) => {
      const bk = (await book(t.http, market, product.id, kg)).body;
      await approve(t.http, farmer, bk.id);
      if (paid) await pay(t.http, market, bk.id);
      return (await t.prisma.shipment.findFirstOrThrow({ where: { bookingId: bk.id } })).id;
    };
    return { driver, farmer, market, p, load };
  }

  it("Telegram username: profilda saqlanadi (@ olib tashlanadi), noto'g'ri format 400, bo'sh qiymat tozalaydi; aloqada qaytadi", async () => {
    const w = await world();
    expect((await send('patch', w.driver, '/profile', { telegramUsername: 'ab' })).status).toBe(400);
    const ok = await send('patch', w.driver, '/profile', { telegramUsername: '@agro_driver' });
    expect(ok.status).toBe(200);
    expect(ok.body.telegramUsername).toBe('agro_driver');
    const c = await send('get', w.farmer, `/driver-posts/${w.p.id}/contact`);
    expect(c.body).toMatchObject({ phone: w.driver.phone, telegramUsername: 'agro_driver' });
    expect((await send('patch', w.driver, '/profile', { telegramUsername: '' })).body.telegramUsername).toBeNull();
    expect((await send('get', w.farmer, `/driver-posts/${w.p.id}/contact`)).body.telegramUsername).toBeNull();
    // ommaviy katalogda username ham telefon ham ko'rinmaydi
    const list = (await send('get', w.farmer, '/driver-posts')).body[0];
    expect(JSON.stringify(list)).not.toContain(w.driver.phone);
  });

  it("taklif qilinadigan yuklar: faqat o'ziniki, ochiq; e'longa sig'adimi belgisi", async () => {
    const w = await world();
    const a = await w.load(3000), big = await w.load(12000), unpaid = await w.load(1000, false);
    const list = (await send('get', w.farmer, `/driver-posts/offerable?postId=${w.p.id}`)).body;
    const byId = Object.fromEntries(list.map((x: any) => [x.id, x]));
    expect(byId[a]).toMatchObject({ cargoName: 'Pomidor', weightKg: 3000, fits: true, ready: true, alreadyOffered: false });
    expect(byId[a].price).toBeGreaterThan(0);
    expect(byId[big].fits).toBe(false);
    expect(byId[unpaid].ready).toBe(false);
    expect((await send('get', w.market, '/driver-posts/offerable')).body).toHaveLength(3); // market ham o'z yuklarini ko'radi
    const other = await registerFarmer(t.http);
    expect((await send('get', other, '/driver-posts/offerable')).body).toHaveLength(0);
    expect((await send('get', w.driver, '/driver-posts/offerable')).status).toBe(403);
  });

  it("taklif yuborish: haydovchi kabinetida va Telegramda aniq xabar; takror, begona yuk, sig'maydigan va band yuk rad etiladi", async () => {
    const w = await world();
    await t.prisma.user.update({ where: { id: w.driver.user.id }, data: { telegramChatId: '555' } });
    const a = await w.load(3000), big = await w.load(12000);
    const when = new Date(Date.now() + 86_400_000).toISOString();
    const r = await send('post', w.farmer, `/driver-posts/${w.p.id}/offers`, { shipmentId: a, pickupAt: when, note: 'Ertalab 8 da tayyor' });
    expect(r.status).toBe(201);
    expect(r.body.shipment).toMatchObject({ cargoName: 'Pomidor', weightKg: 3000 });
    await t.app.get(NotificationService).flush();
    const msg = sent.find((s) => s.chatId === '555')!.text.replace(/[  ]/g, ' ');
    expect(msg).toContain('Sizga yuk taklif qilindi');
    expect(msg).toContain('Pomidor');
    expect(msg).toContain('3 000 kg');
    expect(msg).toContain('Samarqand');
    expect(msg).toContain('Toshkent shahri');
    expect(msg).toContain(when.replace('T', ' ').slice(0, 16));
    expect(msg).toContain("so'm");
    expect(msg).toContain('Ertalab 8 da tayyor');
    // takror
    expect((await send('post', w.farmer, `/driver-posts/${w.p.id}/offers`, { shipmentId: a })).status).toBe(409);
    // sig'maydi
    expect((await send('post', w.farmer, `/driver-posts/${w.p.id}/offers`, { shipmentId: big })).status).toBe(409);
    // begona yuk
    const stranger = await registerFarmer(t.http);
    expect((await send('post', stranger, `/driver-posts/${w.p.id}/offers`, { shipmentId: a })).status).toBe(404);
    // haydovchi taklif yubora olmaydi, noto'g'ri id 400
    expect((await send('post', w.driver, `/driver-posts/${w.p.id}/offers`, { shipmentId: a })).status).toBe(403);
    expect((await send('post', w.farmer, `/driver-posts/${w.p.id}/offers`, { shipmentId: 'x' })).status).toBe(400);
    // yuk band bo'lsa taklif qilinmaydi
    const c = await w.load(500);
    await send('post', w.driver, `/shipments/${c}/accept`);
    expect((await send('post', w.market, `/driver-posts/${w.p.id}/offers`, { shipmentId: c })).status).toBe(409);
    // market ham o'z yukini taklif qila oladi
    const d = await w.load(800);
    expect((await send('post', w.market, `/driver-posts/${w.p.id}/offers`, { shipmentId: d })).status).toBe(201);
  });

  it("haydovchi kabinetida takliflar ro'yxati va o'qildi belgisi; begona haydovchi ko'rmaydi", async () => {
    const w = await world();
    const a = await w.load(2000);
    const o = (await send('post', w.farmer, `/driver-posts/${w.p.id}/offers`, { shipmentId: a, note: 'Shoshilinch' })).body;
    const mine = (await send('get', w.driver, '/driver-posts/offers/mine')).body;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id: o.id, readAt: null, note: 'Shoshilinch', open: true, from: { role: 'FARMER' } });
    expect(mine[0].shipment).toMatchObject({ cargoName: 'Pomidor', weightKg: 2000, ready: true });
    expect(JSON.stringify(mine)).not.toContain(w.farmer.phone); // aloqa ma'lumoti yashirin
    expect((await send('post', w.driver, `/driver-posts/offers/${o.id}/read`)).status).toBe(201);
    expect((await send('get', w.driver, '/driver-posts/offers/mine')).body[0].readAt).not.toBeNull();
    const other = await registerDriver(t.http);
    expect((await send('get', other, '/driver-posts/offers/mine')).body).toHaveLength(0);
    expect((await send('post', other, `/driver-posts/offers/${o.id}/read`)).status).toBe(404);
    expect((await send('get', w.farmer, '/driver-posts/offers/mine')).status).toBe(403);
  });
});
