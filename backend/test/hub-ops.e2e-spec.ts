import { Account, bearer, bootApp, createAdmin, createProduct, registerFarmer, resetDb, TestApp } from './helpers';

describe('Hub operatsiyalari: Master QR, OS&D, PaaS (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await bootApp(); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); });

  const send = (m: 'get' | 'post' | 'patch', who: Account | null, path: string, body?: any) => (who ? t.http()[m](path).set('Authorization', bearer(who)) : t.http()[m](path)).send(body);

  async function world() {
    const admin = await createAdmin(t, 'ADMIN'), staff = await createAdmin(t, 'DISPATCHER'), staff2 = await createAdmin(t, 'DISPATCHER');
    const hub = (await send('post', admin, '/hubs', { name: 'Samarqand Hub', region: 'Samarqand' })).body;
    const hub2 = (await send('post', admin, '/hubs', { name: 'Buxoro Hub', region: 'Buxoro' })).body;
    await send('post', admin, `/hubs/${hub.id}/staff`, { userId: staff.user.id });
    await send('post', admin, `/hubs/${hub2.id}/staff`, { userId: staff2.user.id });
    const farmer = await registerFarmer(t.http, { region: 'Qashqadaryo' });
    const product = await createProduct(t.http, farmer, { name: 'Kartoshka', category: 'Sabzavot', quantityKg: 5000, pricePerKg: 3000 });
    const announce = async (extra: Record<string, unknown> = {}, declaredKg = 500) =>
      (await send('post', farmer, '/hub/intakes', { productId: product.id, hubId: hub.id, declaredKg, retailPricePerKg: 4000, ...extra })).body;
    return { admin, staff, staff2, hub, hub2, farmer, product, announce };
  }
  const stockOf = async (hubId: string, productId: string) => (await t.prisma.hubStock.findUnique({ where: { hubId_productId: { hubId, productId } } }))!.weightKg.toString();
  const qtyOf = async (id: string) => (await t.prisma.product.findUniqueOrThrow({ where: { id } })).quantityKg.toString();

  it('fermer boxCount bergan topshirishga Master QR avtomatik yaratiladi: 1 QR = N quti; Hub xodimi ham biriktira oladi', async () => {
    const w = await world();
    const a = await w.announce({ boxCount: 50 });
    expect(a).toMatchObject({ boxCount: 50, kgPerBox: 10, usePackaging: false, packagingStatus: 'NONE' });
    expect(a.masterQr).toMatch(/^MQ-[A-Z2-9]{8}$/);

    const b = await w.announce({}, 100);
    expect(b.masterQr).toBeNull();
    expect((await send('post', w.staff, `/hub/intakes/${b.id}/master-qr`, { boxCount: 0 })).status).toBe(400);
    const att = await send('post', w.staff, `/hub/intakes/${b.id}/master-qr`, { boxCount: 20, code: 'pallet-0001' });
    expect(att.body).toMatchObject({ masterQr: 'PALLET-0001', boxCount: 20 });
    // bitta kod ikki partiyaga biriktirilmaydi; boshqa Hub xodimi va begona fermer kira olmaydi
    const c = await w.announce({}, 50);
    expect((await send('post', w.staff, `/hub/intakes/${c.id}/master-qr`, { boxCount: 5, code: 'PALLET-0001' })).status).toBe(409);
    expect((await send('post', w.staff2, `/hub/intakes/${c.id}/master-qr`, { boxCount: 5 })).status).toBe(403);
    expect((await send('post', await registerFarmer(t.http), `/hub/intakes/${c.id}/master-qr`, { boxCount: 5 })).status).toBe(404);
    // quti sonini yangilash mumkin, kod o'zgarmaydi
    expect((await send('post', w.staff, `/hub/intakes/${b.id}/master-qr`, { boxCount: 25 })).body).toMatchObject({ masterQr: 'PALLET-0001', boxCount: 25 });
  });

  it("QR skaner: partiya ma'lumoti; boshqa Hub xodimi va fermer ko'ra olmaydi", async () => {
    const w = await world();
    const a = await w.announce({ boxCount: 50 });
    const r = await send('get', w.staff, `/hub/qr/${a.masterQr.toLowerCase()}`);
    expect(r.body).toMatchObject({ id: a.id, boxCount: 50, canReceive: true, productName: 'Kartoshka', declaredKg: 500 });
    expect((await send('get', w.staff2, `/hub/qr/${a.masterQr}`)).status).toBe(403);
    expect((await send('get', w.farmer, `/hub/qr/${a.masterQr}`)).status).toBe(403);
    expect((await send('get', w.staff, '/hub/qr/MQ-NOSUCH99')).status).toBe(404);
  });

  it('Qisman ziyon: 50 ta qutidan 5 tasi yaroqsiz -> qoldiq 450 kg, fermer e\'loni 500 kg kamayadi, OS&D yoziladi', async () => {
    const w = await world();
    const a = await w.announce({ boxCount: 50 });
    for (const bad of [{ mode: 'PARTIAL' }, { mode: 'PARTIAL', damagedBoxes: 50 }, { mode: 'PARTIAL', damagedBoxes: 0 }, { mode: 'FULL', damagedBoxes: 3 }, { mode: 'HALF' }]) {
      expect((await send('post', w.staff, `/hub/qr/${a.masterQr}/receive`, bad)).status).toBe(400);
    }
    expect((await send('post', w.staff2, `/hub/qr/${a.masterQr}/receive`, { mode: 'FULL' })).status).toBe(403);
    const ok = await send('post', w.staff, `/hub/qr/${a.masterQr}/receive`, { mode: 'PARTIAL', damagedBoxes: 5, note: 'Yomg\'irda ho\'l bo\'lgan' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ status: 'RECEIVED', receivedKg: 450, damagedBoxes: 5 });
    expect(await stockOf(w.hub.id, w.product.id)).toBe('450');
    expect(await qtyOf(w.product.id)).toBe('4500'); // 5000 - (450 + 50 yaroqsiz)
    const osd = await t.prisma.hubOsd.findUniqueOrThrow({ where: { intakeId: a.id } });
    expect(osd).toMatchObject({ type: 'DAMAGED', totalBoxes: 50, damagedBoxes: 5 });
    expect([osd.expectedKg.toString(), osd.receivedKg.toString(), osd.lossKg.toString()]).toEqual(['500', '450', '50']);
    expect((await send('post', w.staff, `/hub/qr/${a.masterQr}/receive`, { mode: 'FULL' })).status).toBe(409); // ikki marta qabul qilinmaydi
    expect(await stockOf(w.hub.id, w.product.id)).toBe('450');
  });

  it("To'liq qabul: butun partiya, OS&D yozuvi yo'q; quti soni yo'q partiya skaner bilan qabul qilinmaydi", async () => {
    const w = await world();
    const a = await w.announce({ boxCount: 10 });
    expect((await send('post', w.staff, `/hub/qr/${a.masterQr}/receive`, { mode: 'FULL' })).body).toMatchObject({ status: 'RECEIVED', receivedKg: 500, damagedBoxes: 0 });
    expect(await stockOf(w.hub.id, w.product.id)).toBe('500');
    expect(await t.prisma.hubOsd.count()).toBe(0);
    const b = await w.announce({}, 100);
    await t.prisma.hubIntake.update({ where: { id: b.id }, data: { masterQr: 'NOBOXES-1' } });
    expect((await send('post', w.staff, '/hub/qr/NOBOXES-1/receive', { mode: 'FULL' })).status).toBe(409);
  });

  it("oddiy qabulda e'londan kam vazn SHORT sifatida OS&D hisobotiga tushadi; hisobot: jami, foiz, Hub bo'yicha doira", async () => {
    const w = await world();
    const a = await w.announce({ boxCount: 50 }), b = await w.announce({}, 100);
    await send('post', w.staff, `/hub/qr/${a.masterQr}/receive`, { mode: 'PARTIAL', damagedBoxes: 5 });
    await send('post', w.staff, `/hub/intakes/${b.id}/receive`, { receivedKg: 90 });
    const rep = await send('get', w.staff, '/hub/osd');
    expect(rep.status).toBe(200);
    expect(rep.body.summary).toMatchObject({ count: 2, lossKg: 60, damagedBoxes: 5, expectedKg: 600, lossPercent: 10, byType: { DAMAGED: { count: 1, lossKg: 50 }, SHORT: { count: 1, lossKg: 10 } } });
    expect(rep.body.items).toHaveLength(2);
    expect(rep.body.items[0]).toMatchObject({ hub: 'Samarqand Hub', productName: 'Kartoshka' });
    expect((await send('get', w.staff2, '/hub/osd')).body.summary.count).toBe(0); // boshqa Hub xodimi o'z Hub'ini ko'radi
    expect((await send('get', w.staff2, `/hub/osd?hubId=${w.hub.id}`)).status).toBe(403);
    expect((await send('get', w.farmer, '/hub/osd')).status).toBe(403);
    expect((await send('get', w.admin, `/hub/osd?hubId=${w.hub.id}&from=2020-01-01T00:00:00Z`)).body.summary.count).toBe(2);
  });

  it("PaaS: narx bazadan (Hub), e'lon paytida qayd etiladi; qadoqlash navbati; qabulda haq haqiqiy vaznga qayta hisoblanadi", async () => {
    const w = await world();
    expect((await send('patch', w.admin, `/hubs/${w.hub.id}`, { packagingFeePerKg: 250 })).body.packagingFeePerKg).toBe('250');
    expect((await send('patch', w.admin, `/hubs/${w.hub.id}`, { packagingFeePerKg: -1 })).status).toBe(400);
    const a = await w.announce({ boxCount: 50, usePackaging: true }), plain = await w.announce({}, 100);
    expect(a).toMatchObject({ usePackaging: true, packagingStatus: 'PENDING', packagingRate: 250, packagingFee: 125000 });
    await send('patch', w.admin, `/hubs/${w.hub.id}`, { packagingFeePerKg: 999 }); // keyingi o'zgarish eski topshirishga ta'sir qilmaydi
    const q1 = await send('get', w.staff, '/hub/packaging');
    expect(q1.body.map((x: any) => x.id)).toEqual([a.id]); // xizmat tanlanmagan topshirish navbatda yo'q
    expect((await send('post', w.staff, `/hub/packaging/${a.id}/done`)).status).toBe(409); // qabulgacha qadoqlab bo'lmaydi
    await send('post', w.staff, `/hub/qr/${a.masterQr}/receive`, { mode: 'PARTIAL', damagedBoxes: 5 });
    const after = (await send('get', w.staff, '/hub/packaging')).body[0];
    expect(after).toMatchObject({ id: a.id, status: 'RECEIVED', packagingFee: 112500 }); // 450 kg x 250
    expect((await send('get', w.staff2, '/hub/packaging')).body).toHaveLength(0);
    expect((await send('post', w.staff2, `/hub/packaging/${a.id}/done`)).status).toBe(403);
    expect((await send('post', w.staff, `/hub/packaging/${a.id}/done`)).body).toMatchObject({ packagingStatus: 'DONE' });
    expect((await send('post', w.staff, `/hub/packaging/${a.id}/done`)).status).toBe(409);
    expect((await send('get', w.staff, '/hub/packaging')).body).toHaveLength(0);
    void plain;
  });

  it('HUB_ADMIN shu endpointlarga kira oladi, boshqa admin rollari kira olmaydi', async () => {
    const w = await world();
    const hubAdmin = await createAdmin(t, 'ADMIN', 'HUB_ADMIN'), fin = await createAdmin(t, 'ADMIN', 'FINANCE_ADMIN');
    const a = await w.announce({ boxCount: 10 });
    expect((await send('get', hubAdmin, `/hub/qr/${a.masterQr}`)).status).toBe(200);
    expect((await send('get', hubAdmin, '/hub/osd')).status).toBe(200);
    expect((await send('get', hubAdmin, '/hub/stock')).status).toBe(200);
    for (const p of [`/hub/qr/${a.masterQr}`, '/hub/osd', '/hub/packaging', '/hub/stock']) expect((await send('get', fin, p)).status).toBe(403);
  });
});
