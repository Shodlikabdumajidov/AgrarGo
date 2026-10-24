import { existsSync } from 'fs';
import { join } from 'path';
import { bearer, bootApp, createAdmin, createProduct, registerDriver, registerFarmer, registerMarket, resetDb, TestApp } from './helpers';
import { UPLOADS_DIR } from '../src/profile/profile.service';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

describe('Profil muqovasi va katalog filtrlari (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await bootApp(); });
  afterAll(async () => { await t.close(); });
  beforeEach(async () => { await resetDb(t.prisma); });

  const up = (who: any, buf: Buffer, name = 'cover.png') => t.http().post('/profile/cover').set('Authorization', bearer(who)).attach('file', buf, name);

  describe('muqova (cover banner)', () => {
    it("fermer va market yuklaydi; yangi rasm eskisini diskdan o'chiradi; ommaviy yo'ldan beriladi", async () => {
      for (const who of [await registerFarmer(t.http), await registerMarket(t.http)]) {
        const a = await up(who, PNG);
        expect(a.status).toBe(201);
        expect(a.body.coverUrl).toMatch(/^\/uploads\/covers\/.+\.png$/);
        expect(a.body.passwordHash).toBeUndefined();
        const first = join(UPLOADS_DIR, a.body.coverUrl.replace('/uploads/', ''));
        expect(existsSync(first)).toBe(true);
        expect((await t.http().get(a.body.coverUrl)).status).toBe(200);

        const b = await up(who, PNG);
        expect(b.body.coverUrl).not.toBe(a.body.coverUrl);
        expect(existsSync(first)).toBe(false); // eskisi o'chdi
        expect((await t.http().get('/profile').set('Authorization', bearer(who))).body.coverUrl).toBe(b.body.coverUrl);

        const del = await t.http().delete('/profile/cover').set('Authorization', bearer(who));
        expect(del.status).toBe(200);
        expect(del.body.coverUrl).toBeNull();
        expect(existsSync(join(UPLOADS_DIR, b.body.coverUrl.replace('/uploads/', '')))).toBe(false);
      }
    });

    it("haydovchi, dispetcher va admin yuklay olmaydi (403); tokensiz 401", async () => {
      const driver = await registerDriver(t.http);
      const disp = await createAdmin(t, 'DISPATCHER');
      expect((await up(driver, PNG)).status).toBe(403);
      expect((await up(disp, PNG)).status).toBe(403);
      expect((await t.http().delete('/profile/cover').set('Authorization', bearer(driver))).status).toBe(403);
      expect((await t.http().post('/profile/cover').attach('file', PNG, 'c.png')).status).toBe(401);
    });

    it("soxta fayl (kengaytma/Content-Type PNG, mazmuni emas) va fayl yo'q: 400; juda katta fayl rad etiladi", async () => {
      const farmer = await registerFarmer(t.http);
      expect((await up(farmer, Buffer.from('<?php echo 1; ?>'), 'x.png')).status).toBe(400);
      expect((await t.http().post('/profile/cover').set('Authorization', bearer(farmer))).status).toBe(400);
      const big = Buffer.concat([PNG, Buffer.alloc(4 * 1024 * 1024 + 10)]);
      expect([400, 413]).toContain((await up(farmer, big)).status);
      expect((await t.http().get('/profile').set('Authorization', bearer(farmer))).body.coverUrl).toBeNull();
    });
  });

  describe('katalog: narx va miqdor oralig\'i', () => {
    async function seed() {
      const f = await registerFarmer(t.http);
      await createProduct(t.http, f, { name: 'Arzon', quantityKg: 100, pricePerKg: 1000 });
      await createProduct(t.http, f, { name: "O'rta", quantityKg: 500, pricePerKg: 5000 });
      await createProduct(t.http, f, { name: 'Qimmat', quantityKg: 2000, pricePerKg: 9000 });
    }
    const list = (qs = '') => t.http().get(`/marketplace${qs}`);
    const names = (r: any) => r.body.items.map((i: any) => i.name).sort();

    it('narx bo`yicha (min/max) va miqdor bo`yicha filtr, chegaralar kiritilgan', async () => {
      await seed();
      expect(names(await list('?minPrice=2000&maxPrice=6000'))).toEqual(["O'rta"]);
      expect(names(await list('?minPrice=5000'))).toEqual(["O'rta", 'Qimmat']);
      expect(names(await list('?maxPrice=1000'))).toEqual(['Arzon']);
      expect(names(await list('?minQty=500&maxQty=2000'))).toEqual(["O'rta", 'Qimmat']);
      expect(names(await list('?maxQty=99'))).toEqual([]);
      expect(names(await list('?minPrice=2000&maxQty=600'))).toEqual(["O'rta"]); // birga ishlaydi
      expect(names(await list('?minPrice=&maxPrice='))).toHaveLength(3); // bo'sh qiymat e'tiborga olinmaydi
    });

    it('slayder chegaralari meta.ranges da (filtrdan mustaqil)', async () => {
      await seed();
      const r = (await list('?minPrice=5000')).body.meta.ranges;
      expect(r.price).toEqual({ min: '1000', max: '9000' });
      expect(r.quantity).toEqual({ min: '100', max: '2000' });
      const empty = await resetDb(t.prisma).then(() => list());
      expect(empty.body.meta.ranges.price).toEqual({ min: null, max: null });
    });

    it("noto'g'ri qiymatlar rad etiladi: manfiy, matn, min > max", async () => {
      await seed();
      for (const qs of ['?minPrice=-1', '?maxPrice=abc', '?minQty=-5', '?minPrice=9000&maxPrice=1000', '?minQty=500&maxQty=100']) {
        expect((await list(qs)).status).toBe(400);
      }
    });
  });
});
