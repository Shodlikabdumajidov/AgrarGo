import { TELEGRAM_API, TelegramApiError } from '../src/telegram/telegram-api';
import { NotificationService } from '../src/telegram/notification.service';
import { TelegramBotService } from '../src/telegram/telegram-bot.service';
import {
  approve, book, bearer, bootApp, createAdmin, createProduct, pay, registerDriver, registerFarmer, registerMarket, resetDb, TestApp,
} from './helpers';

const FAKE_TOKEN = '1234567890:AAFakeTokenFakeTokenFakeTokenFake_12';

describe('Telegram bot va xabarnomalar (e2e)', () => {
  let t: TestApp;
  let sent: { chatId: string; text: string }[];
  let failWith: ((chatId: string) => Error | null) | null;
  let bot: TelegramBotService;
  let notify: NotificationService;

  beforeAll(async () => {
    t = await bootApp({ TELEGRAM_BOT_TOKEN: FAKE_TOKEN, TELEGRAM_BOT_USERNAME: 'AgrarGoBot', TELEGRAM_LINK_TTL_SECONDS: '600' });
    const api: any = t.app.get(TELEGRAM_API);
    api.sendMessage = async (chatId: string, text: string) => {
      const err = failWith?.(chatId);
      if (err) throw err;
      sent.push({ chatId, text });
    };
    bot = t.app.get(TelegramBotService);
    notify = t.app.get(NotificationService);
  });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); sent = []; failWith = null; });

  const api = (m: 'get' | 'post' | 'delete', who: any, path: string) => t.http()[m](path).set('Authorization', bearer(who));
  const say = (chatId: number, text: string, type = 'private') => bot.handleUpdate({ update_id: 1, message: { text, chat: { id: chatId, type } } });
  const textsTo = (chat: string) => sent.filter((s) => s.chatId === chat).map((s) => s.text.replace(/[\u00a0\u202f]/g, ' '));
  const dbUser = (id: string) => t.prisma.user.findUniqueOrThrow({ where: { id } });

  async function linkUser(who: any, chat: number) {
    const { token } = (await api('post', who, '/profile/telegram/link')).body;
    await say(chat, `/start ${token}`);
    return token as string;
  }

  describe('bog\'lash', () => {
    it("havola: bir martalik token, bazada faqat xesh; bot /start bilan ulaydi; token qayta ishlatilmaydi", async () => {
      const farmer = await registerFarmer(t.http);
      expect((await api('get', farmer, '/profile/telegram')).body).toMatchObject({ enabled: true, linked: false, botUsername: 'AgrarGoBot' });

      const res = await api('post', farmer, '/profile/telegram/link');
      expect(res.status).toBe(201);
      const { token, url, expiresAt } = res.body;
      expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
      expect(url).toBe(`https://t.me/AgrarGoBot?start=${token}`);
      expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now() + 500_000);
      const row = await dbUser(farmer.user.id);
      expect(row.telegramAuthToken).not.toBeNull();
      expect(row.telegramAuthToken).not.toBe(token); // ochiq token saqlanmaydi

      await say(777, `/start ${token}`);
      const linked = await dbUser(farmer.user.id);
      expect(linked).toMatchObject({ telegramChatId: '777', telegramAuthToken: null, telegramAuthTokenExpiresAt: null });
      expect(linked.telegramLinkedAt).not.toBeNull();
      expect(textsTo('777')[0]).toContain('Ulandi');
      expect((await api('get', farmer, '/profile/telegram')).body).toMatchObject({ linked: true });

      // ikkinchi marta: yaroqsiz
      await say(888, `/start ${token}`);
      expect(textsTo('888')[0]).toContain('yaroqsiz');
      expect((await dbUser(farmer.user.id)).telegramChatId).toBe('777');
    });

    it("maxfiy maydonlar API javoblarida ko'rinmaydi (profil, login, admin)", async () => {
      const farmer = await registerFarmer(t.http);
      await linkUser(farmer, 555);
      await api('post', farmer, '/profile/telegram/link'); // yangi, ishlatilmagan token ham yashirin
      const prof = (await api('get', farmer, '/profile')).body;
      expect(prof.telegramLinked).toBe(true);
      const login = (await t.http().post('/auth/login').send({ phone: farmer.phone, password: 'parol1234' })).body.user;
      const admin = await createAdmin(t, 'ADMIN');
      const detail = (await api('get', admin, `/admin/users/${farmer.user.id}`)).body;
      for (const body of [prof, login, detail]) {
        const json = JSON.stringify(body);
        expect(json).not.toMatch(/telegramChatId|telegramAuthToken|telegramLinkedAt|passwordHash/);
        expect(json).not.toContain('555');
      }
      expect(login.telegramLinked).toBe(true);
    });

    it("muddati o'tgan, buzilgan va begona tokenlar rad etiladi; yangi token eskisini bekor qiladi", async () => {
      const u = await registerFarmer(t.http);
      const first = (await api('post', u, '/profile/telegram/link')).body.token;
      const second = (await api('post', u, '/profile/telegram/link')).body.token;
      await say(1, `/start ${first}`);
      expect(textsTo('1')[0]).toContain('yaroqsiz');

      await t.prisma.user.update({ where: { id: u.user.id }, data: { telegramAuthTokenExpiresAt: new Date(Date.now() - 1000) } });
      await say(2, `/start ${second}`);
      expect(textsTo('2')[0]).toContain('yaroqsiz');

      for (const bad of ['short', "x'; DROP TABLE \"User\";--", 'A'.repeat(65), '%00%00%00%00%00%00%00%00%00%00']) await say(3, `/start ${bad}`);
      expect(textsTo('3')).toHaveLength(4);
      expect(textsTo('3').every((x) => x.includes('yaroqsiz') || x.includes('/unlink'))).toBe(true);
      expect((await dbUser(u.user.id)).telegramChatId).toBeNull();
    });

    it("bir chat — bitta akkaunt; faol bo'lmagan foydalanuvchi ulanmaydi; guruh chatlari e'tiborga olinmaydi", async () => {
      const a = await registerFarmer(t.http);
      const b = await registerMarket(t.http);
      await linkUser(a, 100);
      const tb = (await api('post', b, '/profile/telegram/link')).body.token;
      await say(100, `/start ${tb}`);
      expect(textsTo('100').pop()).toContain('boshqa AgrarGo akkauntiga');
      expect((await dbUser(b.user.id)).telegramChatId).toBeNull();

      await say(-5000, `/start ${tb}`, 'group');
      expect(textsTo('-5000')).toHaveLength(0);
      expect((await dbUser(b.user.id)).telegramChatId).toBeNull();

      await t.prisma.user.update({ where: { id: b.user.id }, data: { isActive: false } });
      await say(200, `/start ${tb}`);
      expect((await dbUser(b.user.id)).telegramChatId).toBeNull();
    });

    it('parallel /start: token faqat bir marta ishlaydi', async () => {
      const u = await registerFarmer(t.http);
      const { token } = (await api('post', u, '/profile/telegram/link')).body;
      await Promise.all([say(11, `/start ${token}`), say(12, `/start ${token}`), say(13, `/start ${token}`)]);
      const linked = (await dbUser(u.user.id)).telegramChatId;
      expect(['11', '12', '13']).toContain(linked);
      expect(sent.filter((s) => s.text.includes('Ulandi'))).toHaveLength(1);
    });

    it("uzish: sayt (DELETE) va bot (/unlink); qayta ulash mumkin", async () => {
      const u = await registerFarmer(t.http);
      await linkUser(u, 300);
      expect((await api('delete', u, '/profile/telegram')).body).toMatchObject({ linked: false });
      expect(await dbUser(u.user.id)).toMatchObject({ telegramChatId: null, telegramLinkedAt: null });
      expect(textsTo('300').pop()).toContain('uzildi');

      await linkUser(u, 301);
      await say(301, '/unlink');
      expect((await dbUser(u.user.id)).telegramChatId).toBeNull();
      await say(301, '/unlink');
      expect(textsTo('301').pop()).toContain('hech qanday akkauntga ulanmagan');
    });

    it("/start tokensiz va noma'lum buyruq: yordam; havola tezligi cheklangan; autentifikatsiyasiz kirib bo'lmaydi", async () => {
      await say(40, '/start');
      await say(40, 'salom');
      expect(textsTo('40').every((x) => x.includes('/unlink'))).toBe(true);
      expect((await t.http().post('/profile/telegram/link')).status).toBe(401);
      expect((await t.http().get('/profile/telegram')).status).toBe(401);

      const limited = await bootApp({ TELEGRAM_BOT_TOKEN: FAKE_TOKEN, THROTTLE_TELEGRAM_LIMIT: '2' });
      try {
        const u = await registerFarmer(limited.http);
        const codes: number[] = [];
        for (let i = 0; i < 3; i++) codes.push((await limited.http().post('/profile/telegram/link').set('Authorization', bearer(u))).status);
        expect(codes).toEqual([201, 201, 429]);
      } finally { await limited.close(); }
    });
  });

  describe("bot sozlanmagan bo'lsa", () => {
    it("havola 503; holat enabled=false; boshqa funksiyalar ishlaydi", async () => {
      const off = await bootApp({ TELEGRAM_BOT_TOKEN: '' });
      try {
        const u = await registerFarmer(off.http);
        expect((await off.http().get('/profile/telegram').set('Authorization', bearer(u))).body).toMatchObject({ enabled: false, linked: false });
        expect((await off.http().post('/profile/telegram/link').set('Authorization', bearer(u))).status).toBe(503);
        const m = await registerMarket(off.http);
        const p = await createProduct(off.http, u);
        expect((await book(off.http, m, p.id, 10)).status).toBe(201);
      } finally { await off.close(); }
    });
  });

  describe('xabarnomalar: bron va escrow', () => {
    async function trio() {
      const farmer = await registerFarmer(t.http, { farmName: 'Ali <b>Agro</b>' });
      const market = await registerMarket(t.http, { companyName: 'Korzinka & Co' });
      await linkUser(farmer, 1001);
      await linkUser(market, 2001);
      sent = [];
      return { farmer, market };
    }

    it("market bron qilsa → fermerga; tasdiqlansa → ikkalasiga; to'lov (escrow) → ikkalasiga", async () => {
      const { farmer, market } = await trio();
      const product = await createProduct(t.http, farmer, { name: 'Pomidor <script>', quantityKg: 1000, pricePerKg: 4000 });
      const b = (await book(t.http, market, product.id, 100)).body;
      await notify.flush();
      expect(sent.map((s) => s.chatId)).toEqual(['1001']);
      expect(sent[0].text).toContain('Yangi bron');
      expect(sent[0].text).toContain('Korzinka &amp; Co'); // HTML escape
      expect(sent[0].text).toContain('Pomidor &lt;script&gt;');
      expect(sent[0].text).not.toContain('<script>');
      expect(sent[0].text.replace(/[\u00a0\u202f]/g, ' ')).toContain('400 000');

      sent = [];
      await approve(t.http, farmer, b.id);
      await notify.flush();
      expect(sent.map((s) => s.chatId).sort()).toEqual(['1001', '2001']);
      expect(textsTo('2001')[0]).toContain('Bron tasdiqlandi');

      sent = [];
      expect((await pay(t.http, market, b.id)).status).toBe(200);
      await notify.flush();
      expect(sent.map((s) => s.chatId).sort()).toEqual(['1001', '2001']);
      expect(sent.every((s) => s.text.includes('escrow'))).toBe(true);

      sent = [];
      await pay(t.http, market, b.id); // takroriy to'lov: yangi xabar yo'q
      await notify.flush();
      expect(sent).toHaveLength(0);
    });

    it("xato amal (rad etilgan so'rov, bekor qilingan tranzaksiya) haqida xabar ketmaydi; ulanmaganlarga hech narsa", async () => {
      const farmer = await registerFarmer(t.http);
      const market = await registerMarket(t.http);
      const product = await createProduct(t.http, farmer, { quantityKg: 100 });
      await book(t.http, market, product.id, 10);
      await notify.flush();
      expect(sent).toHaveLength(0); // hech kim ulanmagan

      await linkUser(farmer, 1);
      sent = [];
      expect((await book(t.http, market, product.id, 999999)).status).toBe(409); // yetarli emas
      expect((await book(t.http, market, 'x', 1)).status).toBe(400);
      await notify.flush();
      expect(sent).toHaveLength(0);
    });

    it("Telegram ishlamasa ham amal bajariladi; bot bloklangan chat avtomatik uziladi", async () => {
      const { farmer, market } = await trio();
      const product = await createProduct(t.http, farmer, { quantityKg: 500 });
      failWith = () => new Error('tarmoq');
      expect((await book(t.http, market, product.id, 10)).status).toBe(201);
      await notify.flush();
      expect((await dbUser(farmer.user.id)).telegramChatId).toBe('1001'); // vaqtinchalik xato: uzilmaydi

      failWith = (chat) => (chat === '1001' ? new TelegramApiError(403, 'Forbidden: bot was blocked by the user') : null);
      expect((await book(t.http, market, product.id, 10)).status).toBe(201);
      await notify.flush();
      expect((await dbUser(farmer.user.id)).telegramChatId).toBeNull();
      expect((await dbUser(market.user.id)).telegramChatId).toBe('2001');
    });
  });

  describe('xabarnomalar: yuk holati', () => {
    it("bron yuki: Yo'lda va Yetkazildi → fermer va marketga; dispetcherga yo'q", async () => {
      const farmer = await registerFarmer(t.http);
      const market = await registerMarket(t.http);
      const driver = await registerDriver(t.http, { capacityKg: 2000 });
      const disp = await createAdmin(t, 'DISPATCHER');
      await linkUser(farmer, 11); await linkUser(market, 22); await linkUser(disp, 33);
      const product = await createProduct(t.http, farmer, { quantityKg: 1000 });
      const b = (await book(t.http, market, product.id, 300)).body;
      await approve(t.http, farmer, b.id); await pay(t.http, market, b.id);
      const sid = (await t.prisma.shipment.findFirstOrThrow()).id;
      await t.http().post(`/shipments/${sid}/accept`).set('Authorization', bearer(driver));
      sent = [];
      await t.http().patch(`/shipments/${sid}/advance`).set('Authorization', bearer(driver));
      await notify.flush();
      expect(sent.map((s) => s.chatId).sort()).toEqual(['11', '22']);
      expect(sent[0].text).toContain("yo'lga chiqdi");
      sent = [];
      await t.http().patch(`/shipments/${sid}/advance`).set('Authorization', bearer(driver));
      await notify.flush();
      expect(sent.map((s) => s.chatId).sort()).toEqual(['11', '22']);
      expect(sent[0].text).toContain('yetkazildi');
    });

    it("ombor buyurtmasi: escrow → fermer va market; Yo'lda/Yetkazildi → fermer, market va dispetcher", async () => {
      const staff = await createAdmin(t, 'DISPATCHER');
      const other = await createAdmin(t, 'DISPATCHER'); // ulanmagan dispetcher: xabar olmaydi
      const farmer = await registerFarmer(t.http);
      const market = await registerMarket(t.http);
      const driver = await registerDriver(t.http, { capacityKg: 2000 });
      await linkUser(staff, 3); await linkUser(farmer, 1); await linkUser(market, 2);
      const wh = (m: 'get' | 'post' | 'patch', who: any, path: string, body?: object) => { const r = t.http()[m](path).set('Authorization', bearer(who)); return body ? r.send(body) : r; };
      await wh('post', staff, '/warehouse/units/defaults');
      const units = (await wh('get', staff, '/warehouse/units')).body as any[];
      const it = (await wh('post', farmer, '/warehouse/items', { name: 'Pomidor', category: 'Sabzavot', declaredWeightKg: 1000, pricePerKg: 4000 })).body;
      await wh('post', staff, `/warehouse/items/${it.id}/receive`, { measuredWeightKg: 1000 });
      await wh('post', staff, `/warehouse/items/${it.id}/inspect`, { accept: true, grade: 'A' });
      await wh('post', staff, `/warehouse/items/${it.id}/move`, { zone: 'STORAGE', unitId: units.find((u) => u.type === 'COLD').id });
      await wh('post', staff, `/warehouse/items/${it.id}/move`, { zone: 'OUTBOUND' });
      sent = [];

      const order = (await wh('post', market, '/warehouse/orders', { itemId: it.id, quantityKg: 100 })).body;
      await notify.flush();
      expect(sent.map((s) => s.chatId).sort()).toEqual(['1', '2']);
      expect(textsTo('1')[0]).toContain('392 000'); // fermer sof ulushi (xizmat haqi ayirilgan)
      expect(textsTo('2')[0]).toContain('400 000');

      await wh('patch', staff, `/warehouse/orders/${order.id}/picking`);
      await wh('patch', staff, `/warehouse/orders/${order.id}/picked`);
      const sid = (await t.prisma.shipment.findFirstOrThrow()).id;
      await t.http().post(`/shipments/${sid}/accept`).set('Authorization', bearer(driver));
      sent = [];
      expect((await wh('patch', staff, `/warehouse/orders/${order.id}/dispatch`)).status).toBe(200);
      await notify.flush();
      expect(sent.map((s) => s.chatId).sort()).toEqual(['1', '2', '3']);
      expect(sent[0].text).toContain("yo'lga chiqdi");

      sent = [];
      await t.http().patch(`/shipments/${sid}/advance`).set('Authorization', bearer(driver)); // haydovchi yetkazdi
      await notify.flush();
      expect(sent.map((s) => s.chatId).sort()).toEqual(['1', '2', '3']);
      expect(sent[0].text).toContain('yetkazildi');

      sent = [];
      await wh('patch', market, `/warehouse/orders/${order.id}/deliver`); // tasdiqlash: yuk allaqachon yetkazilgan, takroriy xabar yo'q
      await notify.flush();
      expect(sent).toHaveLength(0);
      void other;
    });

    it("ombor buyurtmasini market tasdiqlasa (haydovchi yetkazishidan oldin) yuk Yetkazildi xabari bir marta ketadi", async () => {
      const staff = await createAdmin(t, 'DISPATCHER');
      const farmer = await registerFarmer(t.http);
      const market = await registerMarket(t.http);
      const driver = await registerDriver(t.http, { capacityKg: 2000 });
      await linkUser(market, 2); await linkUser(staff, 3);
      const wh = (m: 'get' | 'post' | 'patch', who: any, path: string, body?: object) => { const r = t.http()[m](path).set('Authorization', bearer(who)); return body ? r.send(body) : r; };
      await wh('post', staff, '/warehouse/units/defaults');
      const units = (await wh('get', staff, '/warehouse/units')).body as any[];
      const it = (await wh('post', farmer, '/warehouse/items', { name: 'Olma', category: 'Meva', declaredWeightKg: 500, pricePerKg: 1000 })).body;
      await wh('post', staff, `/warehouse/items/${it.id}/receive`, { measuredWeightKg: 500 });
      await wh('post', staff, `/warehouse/items/${it.id}/inspect`, { accept: true, grade: 'A' });
      await wh('post', staff, `/warehouse/items/${it.id}/move`, { zone: 'STORAGE', unitId: units.find((u) => u.type === 'COLD').id });
      await wh('post', staff, `/warehouse/items/${it.id}/move`, { zone: 'OUTBOUND' });
      const order = (await wh('post', market, '/warehouse/orders', { itemId: it.id, quantityKg: 50 })).body;
      await wh('patch', staff, `/warehouse/orders/${order.id}/picking`); await wh('patch', staff, `/warehouse/orders/${order.id}/picked`);
      const sid = (await t.prisma.shipment.findFirstOrThrow()).id;
      await t.http().post(`/shipments/${sid}/accept`).set('Authorization', bearer(driver));
      await wh('patch', staff, `/warehouse/orders/${order.id}/dispatch`);
      await notify.flush();
      sent = [];
      await Promise.all([wh('patch', market, `/warehouse/orders/${order.id}/deliver`), wh('patch', staff, `/warehouse/orders/${order.id}/deliver`)]);
      await notify.flush();
      expect(sent.filter((s) => s.text.includes('yetkazildi')).map((s) => s.chatId).sort()).toEqual(['2', '3']);
    });
  });
});
