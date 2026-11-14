import { PAYMENT_PROVIDER } from '../src/payment/provider/payment-provider';
import { Account, approve, bearer, book, bootApp, createAdmin, createProduct, pay, registerConsumer, registerDriver, registerFarmer, registerMarket, resetDb, TestApp } from './helpers';

describe('Moliya: escrow qayta hisoblash, qadoqlash ushlanmasi va Finance paneli (e2e)', () => {
  let t: TestApp;
  let calls: { kind: string; paymentId: string; amount: string }[];
  let failRefund = false;
  beforeAll(async () => {
    t = await bootApp();
    const prov: any = t.app.get(PAYMENT_PROVIDER);
    for (const kind of ['charge', 'payout', 'refund']) {
      const orig = prov[kind].bind(prov);
      prov[kind] = async (req: any) => {
        if (kind === 'refund' && failRefund) throw new Error('provider down');
        calls.push({ kind, paymentId: req.paymentId, amount: req.amount });
        return orig(req);
      };
    }
  });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); calls = []; failRefund = false; });

  const send = (m: 'get' | 'post' | 'patch', who: Account | null, path: string, body?: any) => (who ? t.http()[m](path).set('Authorization', bearer(who)) : t.http()[m](path)).send(body);
  const addr = { district: 'Siyob', address: "Registon ko'chasi 10" };

  async function hubWorld() {
    const admin = await createAdmin(t, 'ADMIN'), staff = await createAdmin(t, 'DISPATCHER');
    const hub = (await send('post', admin, '/hubs', { name: 'Samarqand Hub', region: 'Samarqand' })).body;
    await send('post', admin, `/hubs/${hub.id}/staff`, { userId: staff.user.id });
    const farmer = await registerFarmer(t.http, { region: 'Qashqadaryo' });
    const product = await createProduct(t.http, farmer, { name: 'Kartoshka', category: 'Sabzavot', quantityKg: 5000, pricePerKg: 3000 });
    const consumer = await registerConsumer(t.http), courier = await registerDriver(t.http, { region: 'Samarqand' });
    await send('patch', courier, '/local/courier/mode', { enabled: true, hubId: hub.id });
    const intake = async (extra: Record<string, unknown> = {}, kg = 500) =>
      (await send('post', farmer, '/hub/intakes', { productId: product.id, hubId: hub.id, declaredKg: kg, retailPricePerKg: 4000, minOrderKg: 10, ...extra })).body;
    const order = async (kg: number) => (await send('post', consumer, '/local/orders', { productId: product.id, quantityKg: kg, ...addr })).body;
    const finish = async (o: any) => {
      await send('post', staff, `/local/orders/${o.id}/pack-start`, {}); await send('post', staff, `/local/orders/${o.id}/packed`, {});
      await send('post', courier, `/local/orders/${o.id}/accept`, {});
      return send('post', courier, `/local/orders/${o.id}/deliver`, { code: o.deliveryCode });
    };
    return { admin, staff, hub, farmer, product, consumer, courier, intake, order, finish };
  }
  const payOf = (orderId: string) => t.prisma.payment.findUniqueOrThrow({ where: { localOrderId: orderId }, include: { splits: true } });
  const split = (p: { splits: { party: string; amount: any }[] }, party: string) => Number(p.splits.find((s) => s.party === party)!.amount);

  it("OS&D ziyon: 10 qutidan 2 tasi yaroqsiz -> xaridorga 20% qaytadi, fermerga 80% tushadi; qoldiq va miqdor moslanadi", async () => {
    const w = await hubWorld();
    const i = await w.intake();
    await send('post', w.staff, `/hub/intakes/${i.id}/receive`, { receivedKg: 500 });
    const o = await w.order(50); // 50 kg x 4000 = 200 000 mahsulot
    const before = await payOf(o.id);
    expect(Number(before.amount)).toBe(200000);

    const r = await send('post', w.staff, `/local/orders/${o.id}/damage`, { totalBoxes: 10, damagedBoxes: 2, note: "Ezilgan" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ quantityKg: 40, status: 'PENDING' });
    const after = await payOf(o.id);
    expect(after.status).toBe('HELD');
    expect(Number(after.amount)).toBe(160000);
    expect(Number(after.refundedAmount)).toBe(40000);
    expect(split(after, 'FARMER')).toBe(160000);
    expect(split(after, 'HUB')).toBe(Number(before.hubFee));
    expect(calls.filter((c) => c.kind === 'refund').map((c) => [c.paymentId, c.amount])).toEqual([[`${before.id}:adj:1`, '40000.00']]);
    const st = (await t.prisma.hubStock.findFirstOrThrow({ where: { productId: w.product.id } }));
    expect([Number(st.weightKg), Number(st.reservedKg)]).toEqual([490, 40]); // 10 kg yaroqsiz hisobdan chiqdi
    const osd = await t.prisma.hubOsd.findUniqueOrThrow({ where: { localOrderId: o.id } });
    expect(osd).toMatchObject({ type: 'DAMAGED', totalBoxes: 10, damagedBoxes: 2 });
    expect([Number(osd.lossKg), Number(osd.refundAmount)]).toEqual([10, 40000]);

    // ikkinchi marta qayd etib bo'lmaydi; kuryer olgach ziyon qayd etilmaydi
    expect((await send('post', w.staff, `/local/orders/${o.id}/damage`, { totalBoxes: 10, damagedBoxes: 1 })).status).toBe(409);
    const fin = await w.finish(o);
    expect(fin.body.status).toBe('COMPLETED');
    const done = await payOf(o.id);
    expect(done.status).toBe('RELEASED');
    expect(calls.filter((c) => c.kind === 'payout' && c.paymentId.endsWith(':farmer')).map((c) => c.amount)).toEqual(['160000.00']);
    expect((await send('get', await createAdmin(t, 'ADMIN', 'FINANCE_ADMIN'), '/finance/reconcile')).body).toMatchObject({ ok: true, issues: [] });
  });

  it("barcha qutilar yaroqsiz bo'lsa buyurtma to'liq bekor qilinadi; noto'g'ri qiymatlar va begona rol rad etiladi", async () => {
    const w = await hubWorld();
    const i = await w.intake(); await send('post', w.staff, `/hub/intakes/${i.id}/receive`, { receivedKg: 500 });
    const o = await w.order(20);
    for (const bad of [{ totalBoxes: 5, damagedBoxes: 6 }, { totalBoxes: 0, damagedBoxes: 0 }, { totalBoxes: 5 }]) expect((await send('post', w.staff, `/local/orders/${o.id}/damage`, bad)).status).toBe(400);
    expect((await send('post', w.consumer, `/local/orders/${o.id}/damage`, { totalBoxes: 5, damagedBoxes: 1 })).status).toBe(403);
    expect((await send('post', w.farmer, `/local/orders/${o.id}/damage`, { totalBoxes: 5, damagedBoxes: 1 })).status).toBe(403);
    const r = await send('post', w.staff, `/local/orders/${o.id}/damage`, { totalBoxes: 5, damagedBoxes: 5 });
    expect(r.body.status).toBe('CANCELLED');
    expect((await payOf(o.id)).status).toBe('REFUNDED');
    const st = await t.prisma.hubStock.findFirstOrThrow({ where: { productId: w.product.id } });
    expect([Number(st.weightKg), Number(st.reservedKg)]).toEqual([500, 0]);
  });

  it("provayder xatosi: ziyon qaydi to'liq qaytariladi (summa, qoldiq, buyurtma, jurnal o'zgarmaydi)", async () => {
    const w = await hubWorld();
    const i = await w.intake(); await send('post', w.staff, `/hub/intakes/${i.id}/receive`, { receivedKg: 500 });
    const o = await w.order(50);
    failRefund = true;
    expect((await send('post', w.staff, `/local/orders/${o.id}/damage`, { totalBoxes: 10, damagedBoxes: 2 })).status).toBe(502);
    failRefund = false;
    const p = await payOf(o.id);
    expect([Number(p.amount), Number(p.refundedAmount), split(p, 'FARMER')]).toEqual([200000, 0, 200000]);
    expect(Number((await t.prisma.localOrder.findUniqueOrThrow({ where: { id: o.id } })).quantityKg)).toBe(50);
    const st = await t.prisma.hubStock.findFirstOrThrow({ where: { productId: w.product.id } });
    expect([Number(st.weightKg), Number(st.reservedKg)]).toEqual([500, 50]);
    expect(await t.prisma.hubOsd.count()).toBe(0);
    expect(await t.prisma.paymentAdjustment.count()).toBe(0);
    // xato tuzalgach xuddi shu amal muvaffaqiyatli bo'ladi
    expect((await send('post', w.staff, `/local/orders/${o.id}/damage`, { totalBoxes: 10, damagedBoxes: 2 })).status).toBe(200);
  });

  it("parallel ikki ziyon qaydi: faqat bittasi o'tadi, pul ikki marta qaytmaydi", async () => {
    const w = await hubWorld();
    const i = await w.intake(); await send('post', w.staff, `/hub/intakes/${i.id}/receive`, { receivedKg: 500 });
    const o = await w.order(50);
    const rs = await Promise.all([1, 2].map(() => send('post', w.staff, `/local/orders/${o.id}/damage`, { totalBoxes: 10, damagedBoxes: 2 })));
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(Number((await payOf(o.id)).refundedAmount)).toBe(40000);
    expect(calls.filter((c) => c.kind === 'refund')).toHaveLength(1);
  });

  it("PaaS: yopilayotgan escrow'da fermer ulushidan qadoqlash haqi ushlanib Hub ulushiga o'tadi (bir marta, qoldiq bilan)", async () => {
    const w = await hubWorld();
    const i = await w.intake({ boxCount: 50, usePackaging: true });
    await send('post', w.staff, `/hub/qr/${i.masterQr}/receive`, { mode: 'FULL' });
    // qadoqlanmaguncha ushlanmaydi
    const o0 = await w.order(10);
    await w.finish(o0);
    expect(Number((await t.prisma.hubIntake.findUniqueOrThrow({ where: { id: i.id } })).packagingPaid)).toBe(0);

    await send('post', w.staff, `/hub/packaging/${i.id}/done`);
    const fee = Number((await t.prisma.hubIntake.findUniqueOrThrow({ where: { id: i.id } })).packagingFee); // 500 kg x 200 = 100 000
    expect(fee).toBe(100000);
    calls = [];
    const o1 = await w.order(20); // fermer ulushi 80 000: hammasi ushlanadi (100 000 dan 80 000)
    await w.finish(o1);
    const p1 = await payOf(o1.id);
    expect([split(p1, 'FARMER'), split(p1, 'HUB')]).toEqual([0, Number(p1.hubFee) + 80000]);
    expect(Number((await t.prisma.hubIntake.findUniqueOrThrow({ where: { id: i.id } })).packagingPaid)).toBe(80000);
    const o2 = await w.order(20); // qolgan 20 000 ushlanadi
    await w.finish(o2);
    const p2 = await payOf(o2.id);
    expect([split(p2, 'FARMER'), split(p2, 'HUB')]).toEqual([80000 - 20000, Number(p2.hubFee) + 20000]);
    const o3 = await w.order(10); await w.finish(o3);
    expect(split(await payOf(o3.id), 'FARMER')).toBe(40000); // qarz yopilgan: boshqa ushlanmaydi
    const adjs = await t.prisma.paymentAdjustment.findMany({ where: { kind: 'PACKAGING' }, orderBy: { createdAt: 'asc' } });
    expect(adjs.map((a) => Number(a.transferAmount))).toEqual([80000, 20000]);
    expect(calls.filter((c) => c.kind === 'payout' && c.paymentId === `${p1.id}:farmer`)).toHaveLength(0); // 0 so'm farmerga yuborilmaydi
    expect((await send('get', await createAdmin(t, 'ADMIN', 'FINANCE_ADMIN'), '/finance/reconcile')).body.ok).toBe(true);
  });

  it("Finance paneli: xulosa (escrow holatlari, foyda, keshbek), escrow jadvali, tafsilot, jurnal va ruxsatlar", async () => {
    const w = await hubWorld();
    const fin = await createAdmin(t, 'ADMIN', 'FINANCE_ADMIN');
    const i = await w.intake({ boxCount: 50, usePackaging: true });
    await send('post', w.staff, `/hub/qr/${i.masterQr}/receive`, { mode: 'FULL' });
    await send('post', w.staff, `/hub/packaging/${i.id}/done`);
    const o = await w.order(50); await send('post', w.staff, `/local/orders/${o.id}/damage`, { totalBoxes: 10, damagedBoxes: 1 });
    const held = await w.order(10);
    await w.finish(o);
    const sum = (await send('get', fin, '/finance/summary')).body;
    expect(sum.escrow.byStatus.RELEASED.count).toBe(1);
    expect(sum.escrow.byStatus.HELD.count).toBe(1);
    expect(sum.escrow.heldByKind.LOCAL.count).toBe(1);
    expect(sum.profit.packagingFee).toBe(100000);
    expect(sum.profit.commissionNet).toBeGreaterThan(0);
    expect(sum.profit.total).toBe(sum.profit.commissionNet + sum.profit.warehouseFee + sum.profit.packagingFee);
    expect(sum.disputes).toMatchObject({ count: 1, refunded: 20000 });
    expect(sum.cashback.earned).toBeGreaterThan(0);
    expect((await send('get', fin, '/finance/cashback/monthly')).body[0].earned).toBeGreaterThan(0);

    const all = (await send('get', fin, '/finance/escrow')).body;
    expect(all.total).toBe(2);
    expect((await send('get', fin, '/finance/escrow?status=HELD&kind=LOCAL')).body.items.map((x: any) => x.id)).toEqual([(await payOf(held.id)).id]);
    expect((await send('get', fin, '/finance/escrow?kind=BOOKING')).body.total).toBe(0);
    expect((await send('get', fin, '/finance/escrow?status=NOPE')).status).toBe(400);
    const rel = all.items.find((x: any) => x.status === 'RELEASED');
    expect(rel).toMatchObject({ kind: 'LOCAL', refundedAmount: 20000, adjustments: 2 });
    const det = (await send('get', fin, `/finance/payments/${rel.id}`)).body;
    expect(det.adjustmentList.map((a: any) => a.kind).sort()).toEqual(['DAMAGE', 'PACKAGING']);
    expect(det.splits).toHaveLength(4);
    expect((await send('get', fin, '/finance/adjustments?kind=PACKAGING')).body.total).toBe(1);

    // ruxsatlar
    for (const who of [await createAdmin(t, 'ADMIN', 'SAFETY_ADMIN'), await createAdmin(t, 'ADMIN', 'HUB_ADMIN'), w.staff, w.farmer, w.consumer]) expect((await send('get', who, '/finance/summary')).status).toBe(403);
    expect((await send('get', null, '/finance/summary')).status).toBe(401);
    expect((await send('get', w.admin, '/finance/summary')).status).toBe(200);
  });

  it("nizoni qo'lda hal qilish (bron to'lovi): ziyon, foiz, to'liq qaytarish va chiqarish; xato holatlar", async () => {
    const fin = await createAdmin(t, 'ADMIN', 'FINANCE_ADMIN');
    const farmer = await registerFarmer(t.http), market = await registerMarket(t.http);
    const product = await createProduct(t.http, farmer, { quantityKg: 10000, pricePerKg: 3000 });
    const mk = async (kg: number) => { const b = (await book(t.http, market, product.id, kg)).body; await approve(t.http, farmer, b.id); await pay(t.http, market, b.id); return (await t.prisma.payment.findUniqueOrThrow({ where: { bookingId: b.id } })); };

    const p1 = await mk(500); // 500 kg x 3000 = 1 500 000
    expect(Number(p1.amount)).toBe(1500000);
    const base = `/finance/payments/${p1.id}/resolve`;
    expect((await send('post', fin, base, { action: 'DAMAGE', damagedBoxes: 5, totalBoxes: 50 })).status).toBe(400); // sabab majburiy
    expect((await send('post', fin, base, { action: 'DAMAGE', damagedBoxes: 5, reason: 'Nizo' })).status).toBe(400); // jami qutilar kerak
    expect((await send('post', fin, base, { action: 'DAMAGE', damagedBoxes: 50, totalBoxes: 50, reason: 'Nizo' })).status).toBe(409);
    const r = await send('post', fin, base, { action: 'DAMAGE', damagedBoxes: 5, totalBoxes: 50, reason: "Xaridor shikoyati: 5 quti ho'l" });
    expect(r.status).toBe(200);
    expect(r.body.amount).toBe(1350000);
    expect(r.body.refundedAmount).toBeGreaterThanOrEqual(150000);
    expect(r.body.adjustmentList[0]).toMatchObject({ kind: 'DISPUTE', damagedBoxes: 5, totalBoxes: 50, goodsAmount: 150000 });
    expect(calls.filter((c) => c.kind === 'refund')[0].paymentId).toBe(`${p1.id}:adj:1`);
    expect((await send('post', fin, base, { action: 'PERCENT', percent: 10, reason: 'Kelishuv' })).body.amount).toBe(1215000);
    // fermerga qayta hisoblangan summa o'tadi
    const bookingId = (await t.prisma.payment.findUniqueOrThrow({ where: { id: p1.id } })).bookingId!;
    const rel = await send('post', fin, base, { action: 'RELEASE', reason: 'Nizo hal bo\'ldi' });
    expect(rel.status).toBe(200);
    expect(calls.filter((c) => c.kind === 'payout' && c.paymentId === p1.id).map((c) => c.amount)).toEqual(['1215000.00']);
    expect((await send('post', fin, base, { action: 'DAMAGE', damagedBoxes: 1, totalBoxes: 10, reason: 'Kech' })).status).toBe(409); // endi HELD emas
    void bookingId;

    const p2 = await mk(100);
    expect((await send('post', fin, `/finance/payments/${p2.id}/resolve`, { action: 'REFUND', reason: 'Xaridor rad etdi' })).status).toBe(200);
    expect((await t.prisma.payment.findUniqueOrThrow({ where: { id: p2.id } })).status).toBe('REFUNDED');

    // chakana to'lov bu yo'l bilan hal qilinmaydi
    const w = await hubWorld();
    const i = await w.intake(); await send('post', w.staff, `/hub/intakes/${i.id}/receive`, { receivedKg: 500 });
    const lo = await w.order(10);
    expect((await send('post', fin, `/finance/payments/${(await payOf(lo.id)).id}/resolve`, { action: 'PERCENT', percent: 10, reason: 'Sinov' })).status).toBe(409);
    expect((await send('post', await createAdmin(t, 'ADMIN', 'HUB_ADMIN'), base, { action: 'RELEASE', reason: 'x y z' })).status).toBe(403);
    expect((await send('get', fin, '/finance/reconcile')).body.ok).toBe(true);
  });

  it("reconcile: buzilgan ulush yig'indisi aniqlanadi", async () => {
    const w = await hubWorld();
    const i = await w.intake(); await send('post', w.staff, `/hub/intakes/${i.id}/receive`, { receivedKg: 500 });
    const o = await w.order(10);
    const p = await payOf(o.id);
    await t.prisma.paymentSplit.updateMany({ where: { paymentId: p.id, party: 'COURIER' }, data: { amount: 1 } });
    const rep = (await send('get', await createAdmin(t, 'ADMIN', 'FINANCE_ADMIN'), '/finance/reconcile')).body;
    expect(rep.ok).toBe(false);
    expect(rep.issues[0]).toMatchObject({ type: 'SPLIT_SUM', paymentId: p.id });
  });
});
