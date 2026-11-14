import { TELEGRAM_API, TelegramApiError, TelegramKeyboard } from '../src/telegram/telegram-api';
import { NotificationService } from '../src/telegram/notification.service';
import { TelegramBotService } from '../src/telegram/telegram-bot.service';
import { Account, approve, bearer, book, bootApp, createAdmin, createProduct, pay, registerDriver, registerFarmer, registerMarket, resetDb, TestApp } from './helpers';

const FAKE_TOKEN = '1234567890:AAFakeTokenFakeTokenFakeTokenFake_12';
type Msg = { chatId: string; text: string; keyboard?: TelegramKeyboard };
const post = { status: 'AVAILABLE', trailerType: 'DRY_VAN', capacityKg: 20000, routes: ['Samarqand ↔ Toshkent'], currentLocation: 'Samarqand sh.', loadMode: 'FTL' };

describe('Telegram: real vaqt xabarnomalari, tezkor tugmalar va xatolarga chidamlilik (e2e)', () => {
  let t: TestApp;
  let sent: Msg[];
  let answers: { id: string; text?: string; alert?: boolean }[];
  let cleared: { chatId: string; messageId: number }[];
  let failWith: ((chatId: string) => Error | null) | null;
  let bot: TelegramBotService;
  let notify: NotificationService;

  beforeAll(async () => {
    t = await bootApp({ TELEGRAM_BOT_TOKEN: FAKE_TOKEN, TELEGRAM_BOT_USERNAME: 'AgrarGoBot', PIN_ENFORCE: 'true', TELEGRAM_WEB_URL: 'https://agrargo.example' });
    const api: any = t.app.get(TELEGRAM_API);
    api.sendMessage = async (chatId: string, text: string, keyboard?: TelegramKeyboard) => {
      const err = failWith?.(chatId);
      if (err) throw err;
      sent.push({ chatId, text: text.replace(/[  ]/g, ' '), keyboard });
    };
    api.answerCallbackQuery = async (id: string, text?: string, alert?: boolean) => { answers.push({ id, text, alert }); };
    api.clearKeyboard = async (chatId: string, messageId: number) => { cleared.push({ chatId, messageId }); };
    bot = t.app.get(TelegramBotService);
    notify = t.app.get(NotificationService);
  });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); sent = []; answers = []; cleared = []; failWith = null; });

  const send = (m: 'get' | 'post' | 'patch', who: Account, path: string, body?: any) => t.http()[m](path).set('Authorization', bearer(who)).send(body);
  const link = (a: Account, chat: number) => t.prisma.user.update({ where: { id: a.user.id }, data: { telegramChatId: String(chat), telegramLinkedAt: new Date() } });
  const to = (chat: number) => sent.filter((s) => s.chatId === String(chat));
  const last = async (chat: number) => { await notify.flush(); return to(chat).pop(); };
  const buttons = (m?: Msg) => (m?.keyboard ?? []).flat();
  let cbId = 0;
  const tap = (chat: number, data: string, messageId = 10) => bot.handleUpdate({ update_id: ++cbId, callback_query: { id: `cb${cbId}`, data, message: { message_id: messageId, chat: { id: chat, type: 'private' } } } });

  async function world() {
    const farmer = await registerFarmer(t.http), market = await registerMarket(t.http), driver = await registerDriver(t.http, { capacityKg: 30000 });
    const product = await createProduct(t.http, farmer, { quantityKg: 10000, pricePerKg: 1000, name: 'Pomidor' });
    return { farmer, market, driver, product };
  }

  it("webhook rejimi: setWebhook chaqiriladi, maxfiy sarlavha tekshiriladi, /start TOKEN akkauntni ulaydi", async () => {
    const t2 = await bootApp({ TELEGRAM_BOT_TOKEN: FAKE_TOKEN, TELEGRAM_WEBHOOK_URL: 'https://api.example/telegram/webhook', TELEGRAM_WEBHOOK_SECRET: 'secret_secret_secret_1234' });
    try {
      const api: any = t2.app.get(TELEGRAM_API);
      const out: any[] = [];
      api.sendMessage = async (chatId: string, text: string) => { out.push({ chatId, text }); };
      await resetDb(t2.prisma);
      const farmer = await registerFarmer(t2.http);
      const { token, url } = (await t2.http().post('/profile/telegram/link').set('Authorization', bearer(farmer))).body;
      expect(url).toBe(`https://t.me/AgrarGoBot?start=${token}`);
      const upd = { update_id: 1, message: { text: `/start ${token}`, chat: { id: 4242, type: 'private' } } };
      expect((await t2.http().post('/telegram/webhook').send(upd)).status).toBe(403); // sarlavhasiz
      expect((await t2.http().post('/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', 'noto_g_ri_secret_1234').send(upd)).status).toBe(403);
      expect((await t2.http().post('/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', 'secret_secret_secret_1234').send(upd)).status).toBe(200);
      expect((await t2.prisma.user.findUniqueOrThrow({ where: { id: farmer.user.id } })).telegramChatId).toBe('4242');
      expect(out[0].text).toContain('Ulandi');
      // buzuq tana bo'lsa ham 200 (Telegram qayta yubormasin)
      expect((await t2.http().post('/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', 'secret_secret_secret_1234').send({ foo: 1 })).status).toBe(200);
    } finally { await t2.close(); }
    // webhook sozlanmagan bo'lsa endpoint yopiq
    expect((await t.http().post('/telegram/webhook').send({})).status).toBe(403);
  });

  it("FERMER: yangi bron — [Tasdiqlash]/[Rad etish] tugmalari; tugma bosilsa bron tasdiqlanadi, marketga xabar boradi, qayta bosish xavfsiz", async () => {
    const w = await world();
    await link(w.farmer, 101); await link(w.market, 102);
    const bk = (await book(t.http, w.market, w.product.id, 500)).body;
    const m = (await last(101))!;
    expect(m.text).toContain('Yangi bron');
    expect(buttons(m).map((b) => b.callback)).toEqual([`bk:a:${bk.id}`, `bk:r:${bk.id}`]);
    expect(buttons(m).some((b) => b.url === 'https://agrargo.example')).toBe(true);
    await tap(101, `bk:a:${bk.id}`, 55);
    expect((await t.prisma.booking.findUniqueOrThrow({ where: { id: bk.id } })).status).toBe('APPROVED');
    expect(cleared).toContainEqual({ chatId: '101', messageId: 55 });
    expect(answers[answers.length - 1]).toMatchObject({ text: expect.stringContaining('tasdiqlandi'), alert: false });
    expect((await last(102))!.text).toContain('Bron tasdiqlandi');
    // qayta bosish: xato emas, foydalanuvchiga qisqa javob
    await tap(101, `bk:a:${bk.id}`, 55);
    expect(answers[answers.length - 1]).toMatchObject({ alert: true, text: expect.stringMatching(/allaqachon/) });
    // rad etish
    const bk2 = (await book(t.http, w.market, w.product.id, 100)).body;
    await notify.flush();
    await tap(101, `bk:r:${bk2.id}`);
    expect((await t.prisma.booking.findUniqueOrThrow({ where: { id: bk2.id } })).status).toBe('REJECTED');
    expect((await last(102))!.text).toContain('Bron rad etildi');
  });

  it("tugma xavfsizligi: ulanmagan chat, begona fermer, noto'g'ri rol, buzilgan ma'lumot — hech narsa o'zgarmaydi", async () => {
    const w = await world();
    const other = await registerFarmer(t.http), outsider = await registerMarket(t.http);
    await link(w.farmer, 111); await link(other, 112); await link(outsider, 113);
    const bk = (await book(t.http, w.market, w.product.id, 200)).body;
    await tap(999, `bk:a:${bk.id}`); // ulanmagan chat
    expect(answers[answers.length - 1]).toMatchObject({ alert: true, text: expect.stringContaining('ulanmagan') });
    await tap(112, `bk:a:${bk.id}`); // boshqa fermer
    expect(answers[answers.length - 1]).toMatchObject({ alert: true });
    await tap(113, `bk:a:${bk.id}`); // market: fermer amali
    expect(answers[answers.length - 1]).toMatchObject({ alert: true, text: expect.stringContaining('rolingiz') });
    for (const bad of ['bk:a:xyz', 'zz:a:' + bk.id, 'bk:a:' + bk.id + 'x', '']) await tap(111, bad);
    expect((await t.prisma.booking.findUniqueOrThrow({ where: { id: bk.id } })).status).toBe('PENDING');
    // faol bo'lmagan foydalanuvchi tugma bosa olmaydi
    await t.prisma.user.update({ where: { id: w.farmer.user.id }, data: { isActive: false } });
    await tap(111, `bk:a:${bk.id}`);
    expect((await t.prisma.booking.findUniqueOrThrow({ where: { id: bk.id } })).status).toBe('PENDING');
  });

  it("narx taklifi: fermerga [Tasdiqlash]/[Rad etish]; fermer qarshi taklif yuborsa marketga [Qabul qilish]/[Rad etish]; tugma bilan bron yaratiladi", async () => {
    const w = await world();
    await link(w.farmer, 121); await link(w.market, 122);
    const o = (await send('post', w.market, '/offers', { productId: w.product.id, quantityKg: 100, pricePerKg: 700 })).body;
    const m = (await last(121))!;
    expect(m.text).toContain('Yangi narx taklifi');
    expect(buttons(m).map((b) => b.callback).filter(Boolean)).toEqual([`of:a:${o.id}`, `of:r:${o.id}`]);
    // fermer qarshi taklif (kabinetdan) -> marketga tugmalar
    await send('post', w.farmer, `/offers/${o.id}/counter`, { pricePerKg: 900 });
    const c = (await last(122))!;
    expect(c.text).toContain('qarshi taklif');
    expect(buttons(c).map((b) => b.callback).filter(Boolean)).toEqual([`oc:a:${o.id}`, `oc:r:${o.id}`]);
    await tap(122, `oc:a:${o.id}`);
    const done = await t.prisma.priceOffer.findUniqueOrThrow({ where: { id: o.id } });
    expect(done.status).toBe('ACCEPTED');
    expect(Number((await t.prisma.booking.findUniqueOrThrow({ where: { id: done.bookingId! } })).pricePerKg)).toBe(900);
    // yangi taklif — fermer tugma bilan tasdiqlaydi / rad etadi
    const o2 = (await send('post', w.market, '/offers', { productId: w.product.id, quantityKg: 50, pricePerKg: 800 })).body;
    await notify.flush();
    await tap(121, `of:a:${o2.id}`);
    expect((await t.prisma.priceOffer.findUniqueOrThrow({ where: { id: o2.id } })).status).toBe('ACCEPTED');
    const o3 = (await send('post', w.market, '/offers', { productId: w.product.id, quantityKg: 50, pricePerKg: 800 })).body;
    await tap(121, `of:r:${o3.id}`);
    expect((await t.prisma.priceOffer.findUniqueOrThrow({ where: { id: o3.id } })).status).toBe('REJECTED');
    expect((await last(122))!.text).toContain('Taklif rad etildi');
  });

  it("yuk zanjiri: haydovchi biriktirilganda market (qabul PIN) va fermerga; yo'lda — PIN; yetib kelganda; haydovchi yetib kelganda fermerga (PIN ochilmaydi)", async () => {
    const w = await world();
    await link(w.farmer, 131); await link(w.market, 132); await link(w.driver, 133);
    const bk = (await book(t.http, w.market, w.product.id, 800)).body;
    await approve(t.http, w.farmer, bk.id); await pay(t.http, w.market, bk.id);
    await notify.flush();
    expect(to(131).some((m) => m.text.includes("escrow'ga o'tdi"))).toBe(true);
    const sh = await t.prisma.shipment.findFirstOrThrow({ where: { bookingId: bk.id } });
    sent.length = 0;
    // haydovchi yukni oladi -> market va fermerga
    await send('post', w.driver, `/shipments/${sh.id}/accept`);
    await notify.flush();
    const pins = await t.prisma.shipment.findUniqueOrThrow({ where: { id: sh.id } });
    const assigned = to(132).find((m) => m.text.includes('haydovchi biriktirildi'))!;
    expect(assigned.text).toContain(`Qabul PIN-kodingiz: ${pins.deliveryPin}`);
    expect(assigned.text).not.toContain(pins.pickupPin!);
    expect(to(131).find((m) => m.text.includes('haydovchi biriktirildi'))!.text).not.toMatch(/PIN-kodingiz: \d{4}/);
    // haydovchi yetib keldi -> fermerga (haydovchi PIN'i so'raladi, xabarda PIN yo'q)
    sent.length = 0;
    const arr = await send('post', w.driver, `/shipments/${sh.id}/arrived`);
    expect(arr.status).toBe(200);
    expect(arr.body).toEqual({ notified: true });
    await notify.flush();
    const arrived = to(131).find((m) => m.text.includes('yetib keldi'))!;
    expect(arrived.text).toContain('PIN-kod');
    expect(arrived.text).not.toContain(pins.pickupPin!);
    // fermer PIN kiritadi -> yo'lda: market qabul PIN'i bilan
    sent.length = 0;
    await send('post', w.farmer, `/shipments/${sh.id}/confirm-pickup`, { pin: pins.pickupPin });
    await notify.flush();
    const transit = to(132).find((m) => m.text.includes("yo'lga chiqdi"))!;
    expect(transit.text).toContain(`Qabul PIN-kodingiz: ${pins.deliveryPin}`);
    expect(to(131).find((m) => m.text.includes("yo'lga chiqdi"))!.text).not.toContain('PIN-kodingiz');
    // haydovchi topshiradi -> market: yetib keldi
    sent.length = 0;
    await send('post', w.driver, `/shipments/${sh.id}/deliver`, { pin: pins.deliveryPin });
    await notify.flush();
    expect(to(132).find((m) => m.text.includes('manzilga yetib keldi'))).toBeTruthy();
    expect(to(131).find((m) => m.text.includes('yetkazildi'))).toBeTruthy();
  });

  it("HAYDOVCHI: dispetcher biriktirganda yuklash PIN'i bilan; fermer to'g'ridan-to'g'ri taklif qilganda xabar", async () => {
    const w = await world();
    await link(w.driver, 141);
    const bk = (await book(t.http, w.market, w.product.id, 400)).body;
    await approve(t.http, w.farmer, bk.id); await pay(t.http, w.market, bk.id);
    const sh = await t.prisma.shipment.findFirstOrThrow({ where: { bookingId: bk.id } });
    // fermer e'longa taklif
    const dpost = (await send('post', w.driver, '/driver-posts', post)).body;
    await send('post', w.farmer, `/driver-posts/${dpost.id}/offers`, { shipmentId: sh.id, note: 'Ertalab tayyor' });
    const offer = (await last(141))!;
    expect(offer.text).toContain('Sizga yuk taklif qilindi');
    // dispetcher biriktirish
    const staff = await createAdmin(t, 'DISPATCHER');
    const did = (await t.prisma.driver.findFirstOrThrow({ where: { userId: w.driver.user.id } })).id;
    sent.length = 0;
    expect((await send('post', staff, `/shipments/${sh.id}/assign-driver`, { driverId: did })).status).toBe(200);
    await notify.flush();
    const pins = await t.prisma.shipment.findUniqueOrThrow({ where: { id: sh.id } });
    expect(to(141).find((m) => m.text.includes('Sizga yuk biriktirildi'))!.text).toContain(`Yuklash PIN-kodingiz: ${pins.pickupPin}`);
  });

  it("DISPETCHER/ADMIN: yangi shikoyat — qaror tugmalari bilan (faqat dispetcher, Super va Safety admin); tugma qarorni bajaradi; 5.0 da BAN xabari", async () => {
    const w = await world();
    const bk = (await book(t.http, w.market, w.product.id, 300)).body; await approve(t.http, w.farmer, bk.id);
    const disp = await createAdmin(t, 'DISPATCHER'), sup = await createAdmin(t, 'ADMIN', 'SUPER_ADMIN'), safety = await createAdmin(t, 'ADMIN', 'SAFETY_ADMIN'), fin = await createAdmin(t, 'ADMIN', 'FINANCE_ADMIN');
    await link(disp, 151); await link(sup, 152); await link(safety, 153); await link(fin, 154); await link(w.farmer, 155); await link(w.market, 156);
    const c = (await send('post', w.market, '/complaints', { accusedId: w.farmer.user.id, reason: 'Yukni asossiz bekor qildi va javob bermadi' })).body;
    await notify.flush();
    for (const chat of [151, 152, 153]) {
      const m = to(chat).find((x) => x.text.includes('Yangi shikoyat'))!;
      expect(m).toBeTruthy();
      expect(buttons(m).map((b) => b.callback).filter(Boolean)).toEqual([`cp:u:${c.id}`, `cp:p:${c.id}`, `cp:r:${c.id}`]);
    }
    expect(to(154)).toHaveLength(0); // Finance admin
    expect(to(155)).toHaveLength(0); // aybdor
    expect(to(156)).toHaveLength(0);
    // oddiy foydalanuvchi qaror tugmasini bosa olmaydi
    await tap(156, `cp:u:${c.id}`);
    expect(answers[answers.length - 1]).toMatchObject({ alert: true });
    expect((await t.prisma.complaint.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('PENDING');
    await tap(154, `cp:u:${c.id}`); // Finance admin
    expect((await t.prisma.complaint.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('PENDING');
    // dispetcher tugma bilan hal qiladi
    await tap(151, `cp:p:${c.id}`);
    expect(await t.prisma.complaint.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ status: 'PARTIAL', penalty: 0.5 });
    // 5.0 ga yetganda BAN xabari
    await t.prisma.user.update({ where: { id: w.farmer.user.id }, data: { penaltyPoints: 4 } });
    const c2 = (await send('post', w.market, '/complaints', { accusedId: w.farmer.user.id, reason: 'Yana asossiz bekor qilish holati yuz berdi' })).body;
    await notify.flush(); sent.length = 0;
    await tap(152, `cp:u:${c2.id}`);
    await notify.flush();
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: w.farmer.user.id } })).bannedAt).not.toBeNull();
    for (const chat of [151, 152, 153]) expect(to(chat).some((x) => x.text.includes('Avtomatik BAN'))).toBe(true);
    expect(to(154)).toHaveLength(0);
  });

  it("XATOLARGA CHIDAMLILIK: Telegram uzilsa yoki ishlamasa escrow, PIN tasdiqlash va buyurtma holati to'xtamaydi", async () => {
    const w = await world();
    await link(w.farmer, 161); await link(w.market, 162); await link(w.driver, 163);
    failWith = () => new Error('Telegram sendMessage: tarmoq xatosi'); // hamma yuborish uziladi
    const bk = (await book(t.http, w.market, w.product.id, 600)).body;
    expect(bk.status).toBe('PENDING');
    expect((await approve(t.http, w.farmer, bk.id)).status).toBe(200);
    expect((await pay(t.http, w.market, bk.id)).status).toBe(200);
    const sh = await t.prisma.shipment.findFirstOrThrow({ where: { bookingId: bk.id } });
    expect((await send('post', w.driver, `/shipments/${sh.id}/accept`)).status).toBe(201);
    expect((await send('post', w.driver, `/shipments/${sh.id}/arrived`)).status).toBe(200);
    const pins = await t.prisma.shipment.findUniqueOrThrow({ where: { id: sh.id } });
    expect((await send('post', w.farmer, `/shipments/${sh.id}/confirm-pickup`, { pin: pins.pickupPin })).body.status).toBe('IN_TRANSIT');
    const done = await send('post', w.driver, `/shipments/${sh.id}/deliver`, { pin: pins.deliveryPin });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ status: 'DELIVERED', paymentReleased: true });
    expect((await t.prisma.payment.findFirstOrThrow({ where: { bookingId: bk.id } })).status).toBe('RELEASED');
    await notify.flush(); // jim: xato tashlamaydi
    expect(sent).toHaveLength(0);
    // ulanish saqlanib qoladi (vaqtinchalik xato uzmaydi)
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: w.farmer.user.id } })).telegramChatId).toBe('161');
  });

  it("foydalanuvchi botni bloklagan (403): chat avtomatik uziladi, boshqa qabul qiluvchilarga xabar boradi, asosiy amal buzilmaydi; 429/hang'ga ham chidamli", async () => {
    const w = await world();
    await link(w.farmer, 171); await link(w.market, 172);
    failWith = (chat) => (chat === '171' ? new TelegramApiError(403, 'Forbidden: bot was blocked by the user') : null);
    const bk = (await book(t.http, w.market, w.product.id, 300)).body;
    expect((await approve(t.http, w.farmer, bk.id)).status).toBe(200);
    await notify.flush();
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: w.farmer.user.id } })).telegramChatId).toBeNull(); // avtomatik uzildi
    expect(to(172).some((m) => m.text.includes('Bron tasdiqlandi'))).toBe(true); // market xabarni oldi
    // 429 va "chat not found" ham jim ushlanadi
    failWith = (chat) => (chat === '172' ? new TelegramApiError(429, 'Too Many Requests: retry after 1') : null);
    const bk2 = (await book(t.http, w.market, w.product.id, 100)).body;
    expect(bk2.status).toBe('PENDING');
    await notify.flush();
    expect((await t.prisma.user.findUniqueOrThrow({ where: { id: w.market.user.id } })).telegramChatId).toBe('172');
    // tugma ishlovi paytida Telegram xatosi (answerCallbackQuery/clearKeyboard) ham amalni buzmaydi
    await link(w.farmer, 171); failWith = null;
    const api: any = t.app.get(TELEGRAM_API);
    const [ans, clr] = [api.answerCallbackQuery, api.clearKeyboard];
    api.answerCallbackQuery = async () => { throw new Error('network'); };
    api.clearKeyboard = async () => { throw new Error('network'); };
    try {
      await expect(tap(171, `bk:a:${bk2.id}`)).resolves.toBeUndefined();
      expect((await t.prisma.booking.findUniqueOrThrow({ where: { id: bk2.id } })).status).toBe('APPROVED');
    } finally { api.answerCallbackQuery = ans; api.clearKeyboard = clr; }
  });
});
