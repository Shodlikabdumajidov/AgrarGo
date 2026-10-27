import { bearer, bootApp, createAdmin, nextPhone, registerDriver, registerFarmer, registerMarket, resetDb, TestApp, PASSWORD } from './helpers';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5f645400000000049454e44ae426082', 'hex');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

describe("Agro-Store sotuvchilari: yaratish, verifikatsiya, postlar (e2e)", () => {
  let t: TestApp;
  beforeAll(async () => { t = await bootApp(); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); });

  const create = (who: any, type: string, extra: Record<string, unknown> = {}) =>
    t.http().post('/agro-store/suppliers').set('Authorization', bearer(who)).send({ type, orgName: type === 'PHARMACY' ? 'Agro Farm Dorixona' : "Baraka O'g'it", contactName: 'Aziz Karimov', phone: nextPhone(), password: PASSWORD, ...extra });
  const login = async (phone: string) => (await t.http().post('/auth/login').send({ phone, password: PASSWORD })).body;
  const attach = (path: string, who: any, buf: Buffer, name: string) => t.http().post(path).set('Authorization', bearer(who)).attach('file', buf, name);

  it("admin va dispetcher sotuvchi yaratadi; sotuvchi shu telefon va parol bilan kiradi; boshqa rollar 403; dublikat 409", async () => {
    const admin = await createAdmin(t, 'ADMIN'), disp = await createAdmin(t, 'DISPATCHER');
    const farmer = await registerFarmer(t.http), market = await registerMarket(t.http), driver = await registerDriver(t.http);
    const a = await create(admin, 'PHARMACY');
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ type: 'PHARMACY', orgName: 'Agro Farm Dorixona', contactName: 'Aziz Karimov', verification: 'PENDING', missing: ['license', 'stir'] });
    const b = await create(disp, 'FERTILIZER');
    expect(b.status).toBe(201);
    expect(b.body.missing).toEqual(['stir|passportInfo']);
    for (const who of [farmer, market, driver]) expect((await create(who, 'PHARMACY')).status).toBe(403);
    expect((await t.http().post('/agro-store/suppliers').send({})).status).toBe(401);
    expect((await create(admin, 'XYZ')).status).toBe(400);
    expect((await create(admin, 'PHARMACY', { password: '123' })).status).toBe(400);
    expect((await create(admin, 'PHARMACY', { phone: a.body.phone })).status).toBe(409);
    const lg = await t.http().post('/auth/login').send({ phone: a.body.phone, password: PASSWORD });
    expect(lg.status).toBe(200);
    expect(lg.body.user.role).toBe('AGRO_SUPPLIER');
    const me = await t.http().get('/agro-store/me').set('Authorization', bearer(lg.body.accessToken));
    expect(me.body).toMatchObject({ type: 'PHARMACY', verification: 'PENDING' });
    expect((await t.http().get('/agro-store/suppliers').set('Authorization', bearer(disp))).body).toHaveLength(2);
    expect((await t.http().get('/agro-store/suppliers?type=FERTILIZER').set('Authorization', bearer(admin))).body).toHaveLength(1);
  });

  it("Dorixona: litsenziya va STIR rasmlari yuklanmaguncha tasdiqlanmaydi; tasdiqlanmaguncha postlar ommaga ko'rinmaydi; VERIFIED dan keyin fermer katalogida chiqadi", async () => {
    const admin = await createAdmin(t, 'ADMIN'), disp = await createAdmin(t, 'DISPATCHER'), farmer = await registerFarmer(t.http);
    const sup = (await create(admin, 'PHARMACY')).body;
    const s = (await login(sup.phone)).accessToken;
    const post = await t.http().post('/agro-store/me/products').set('Authorization', bearer(s)).send({ name: 'Fungitsid Test-X', category: 'Fungitsid', price: 185000, unit: 'litr', usage: "1 gektarga 0,4 litr", description: "Zamburug'ga qarshi", stockQty: 120 });
    expect(post.status).toBe(201);
    expect(post.body).toMatchObject({ visible: false, stockQty: 120, price: 185000 });
    const hidden = await t.http().get('/agro-store').set('Authorization', bearer(farmer));
    expect(hidden.body.products.some((p: any) => p.name.uz === 'Fungitsid Test-X')).toBe(false);
    expect((await t.http().patch(`/agro-store/suppliers/${sup.id}/verify`).set('Authorization', bearer(admin))).status).toBe(400);
    expect((await attach('/agro-store/me/documents/license', s, PNG, 'l.png')).status).toBe(201);
    expect((await t.http().patch(`/agro-store/suppliers/${sup.id}/verify`).set('Authorization', bearer(admin))).status).toBe(400); // STIR hali yo'q
    const st = await attach('/agro-store/me/documents/stir', s, PDF, 's.pdf');
    expect(st.status).toBe(201);
    expect(st.body).toMatchObject({ hasLicense: true, hasStirDoc: true, missing: [] });
    expect((await attach('/agro-store/me/documents/stir', s, Buffer.from('not an image'), 'x.txt')).status).toBe(400);
    expect((await attach('/agro-store/me/documents/other', s, PNG, 'l.png')).status).toBe(400);
    // hujjatni egasi va xodim ko'radi, begona ko'rmaydi
    const own = await t.http().get('/agro-store/me/documents/license').set('Authorization', bearer(s)).buffer(true).parse((r: any, cb: any) => { const c: Buffer[] = []; r.on('data', (d: Buffer) => c.push(d)); r.on('end', () => cb(null, Buffer.concat(c))); });
    expect(own.status).toBe(200); expect(own.headers['content-type']).toBe('image/png');
    expect((await t.http().get(`/agro-store/suppliers/${sup.id}/documents/stir`).set('Authorization', bearer(disp))).headers['content-type']).toBe('application/pdf');
    expect((await t.http().get(`/agro-store/suppliers/${sup.id}/documents/stir`).set('Authorization', bearer(farmer))).status).toBe(403);
    // faqat admin tasdiqlaydi (dispetcher emas)
    expect((await t.http().patch(`/agro-store/suppliers/${sup.id}/verify`).set('Authorization', bearer(disp))).status).toBe(403);
    const ok = await t.http().patch(`/agro-store/suppliers/${sup.id}/verify`).set('Authorization', bearer(admin));
    expect(ok.status).toBe(200);
    expect(ok.body.verification).toBe('VERIFIED');
    const shown = await t.http().get('/agro-store').set('Authorization', bearer(farmer));
    const row = shown.body.products.find((p: any) => p.name.uz === 'Fungitsid Test-X');
    expect(row).toMatchObject({ source: 'SUPPLIER', price: 185000, unit: 'litr', supplier: { orgName: 'Agro Farm Dorixona' } });
    expect(shown.body.products.some((p: any) => p.source === 'MOCK')).toBe(true);
    // rasm yuklash
    const photo = await attach(`/agro-store/me/products/${post.body.id}/photo`, s, PNG, 'p.png');
    expect(photo.status).toBe(201);
    expect(photo.body.imageUrl).toMatch(/^\/uploads\/agro-store\/[0-9a-f]+\.png$/);
    expect((await t.http().get(photo.body.imageUrl)).status).toBe(200);
    // arxivlash -> yana ko'rinmaydi
    await t.http().put(`/agro-store/me/products/${post.body.id}`).set('Authorization', bearer(s)).send({ isActive: false });
    expect((await t.http().get('/agro-store').set('Authorization', bearer(farmer))).body.products.some((p: any) => p.name.uz === 'Fungitsid Test-X')).toBe(false);
    expect((await t.http().delete(`/agro-store/me/products/${post.body.id}`).set('Authorization', bearer(s))).status).toBe(200);
  });

  it("Dorixona rad etilsa postlar yashirin; qayta hujjat yuborilsa PENDING ga qaytadi. O'g'it sotuvchi: STIR/pasport ma'lumoti yetarli", async () => {
    const admin = await createAdmin(t, 'ADMIN'), farmer = await registerFarmer(t.http);
    const ph = (await create(admin, 'PHARMACY')).body, fe = (await create(admin, 'FERTILIZER')).body;
    const sp = (await login(ph.phone)).accessToken, sf = (await login(fe.phone)).accessToken;
    await attach('/agro-store/me/documents/license', sp, PNG, 'l.png'); await attach('/agro-store/me/documents/stir', sp, PNG, 's.png');
    expect((await t.http().patch(`/agro-store/suppliers/${ph.id}/reject`).set('Authorization', bearer(admin)).send({})).status).toBe(400);
    const rej = await t.http().patch(`/agro-store/suppliers/${ph.id}/reject`).set('Authorization', bearer(admin)).send({ reason: 'Litsenziya muddati o\'tgan' });
    expect(rej.body).toMatchObject({ verification: 'REJECTED', rejectReason: "Litsenziya muddati o'tgan" });
    expect((await attach('/agro-store/me/documents/license', sp, PNG, 'l2.png')).body.verification).toBe('PENDING');
    // O'g'it sotuvchi
    expect((await t.http().patch(`/agro-store/suppliers/${fe.id}/verify`).set('Authorization', bearer(admin))).status).toBe(400);
    expect((await t.http().put('/agro-store/me').set('Authorization', bearer(sf)).send({ stir: '12' })).status).toBe(400);
    const upd = await t.http().put('/agro-store/me').set('Authorization', bearer(sf)).send({ stir: '305123456', passportInfo: 'AA1234567' });
    expect(upd.body.missing).toEqual([]);
    await t.http().post('/agro-store/me/products').set('Authorization', bearer(sf)).send({ name: 'Ammiak selitrasi', category: "O'g'it", price: 8000, mode: 'CROP', stockQty: 5000 });
    expect((await t.http().get('/agro-store').set('Authorization', bearer(farmer))).body.products.some((p: any) => p.name.uz === 'Ammiak selitrasi')).toBe(false);
    expect((await t.http().patch(`/agro-store/suppliers/${fe.id}/verify`).set('Authorization', bearer(admin))).status).toBe(200);
    expect((await t.http().get('/agro-store').set('Authorization', bearer(farmer))).body.products.some((p: any) => p.name.uz === 'Ammiak selitrasi')).toBe(true);
    // chorva rejimi: LIVESTOCK mahsulot faqat shu rejimda
    await t.http().post('/agro-store/me/products').set('Authorization', bearer(sf)).send({ name: 'Briket Test', category: 'Briket', price: 5000, mode: 'LIVESTOCK', stockQty: 10 });
    expect((await t.http().get('/agro-store?mode=livestock').set('Authorization', bearer(farmer))).body.products.some((p: any) => p.name.uz === 'Briket Test')).toBe(true);
    expect((await t.http().get('/agro-store').set('Authorization', bearer(farmer))).body.products.some((p: any) => p.name.uz === 'Briket Test')).toBe(false);
  });

  it("Market va haydovchi Agro-Store jarayonida ishtirok etmaydi (403); sotuvchi boshqa sotuvchining postiga tegolmaydi", async () => {
    const admin = await createAdmin(t, 'ADMIN'), market = await registerMarket(t.http), driver = await registerDriver(t.http);
    for (const who of [market, driver]) {
      for (const p of ['/agro-store', '/agro-store/me', '/agro-store/me/products', '/agro-store/suppliers']) expect((await t.http().get(p).set('Authorization', bearer(who))).status).toBe(403);
    }
    const a = (await create(admin, 'FERTILIZER')).body, b = (await create(admin, 'FERTILIZER')).body;
    const sa = (await login(a.phone)).accessToken, sb = (await login(b.phone)).accessToken;
    const p = (await t.http().post('/agro-store/me/products').set('Authorization', bearer(sa)).send({ name: 'Mahsulot A', category: "O'g'it", price: 1000 })).body;
    expect((await t.http().put(`/agro-store/me/products/${p.id}`).set('Authorization', bearer(sb)).send({ price: 1 })).status).toBe(404);
    expect((await t.http().delete(`/agro-store/me/products/${p.id}`).set('Authorization', bearer(sb))).status).toBe(404);
    expect((await t.http().get('/agro-store/me/documents/license').set('Authorization', bearer(sb))).status).toBe(404);
    expect((await t.http().post('/agro-store/me/products').set('Authorization', bearer(sa)).send({ name: 'X', category: 'Y', price: 0 })).status).toBe(400);
  });
});
