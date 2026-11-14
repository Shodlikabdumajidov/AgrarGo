import { bootApp, TestApp } from './helpers';

describe("O'quv qo'llanma (e2e)", () => {
  let t: TestApp;
  beforeAll(async () => { t = await bootApp(); });
  afterAll(async () => { await t.close(); });

  it('JSON: 4 rol, har tilda matn; noto\'g\'ri til uz ga tushadi', async () => {
    const uz = (await t.http().get('/guide?lang=uz')).body, ru = (await t.http().get('/guide?lang=ru')).body, en = (await t.http().get('/guide?lang=en')).body;
    expect(uz.roles.map((r: any) => r.role)).toEqual(['FARMER', 'DRIVER', 'MARKET', 'DISPATCHER']);
    expect(uz.roles[1].title).toBe('Haydovchi');
    expect(ru.roles[1].title).toBe('Водитель');
    expect(en.roles[1].title).toBe('Driver');
    const ids = uz.roles[1].topics.map((x: any) => x.id);
    expect(ids).toEqual(expect.arrayContaining(['payouts', 'escrow', 'eld']));
    expect((await t.http().get('/guide?lang=xx')).body.lang).toBe('uz');
    expect((await t.http().get('/guide?role=MARKET')).body.roles).toHaveLength(1);
    for (const r of uz.roles) for (const tp of r.topics) { expect(tp.steps.length).toBeGreaterThan(1); tp.steps.forEach((s: any) => expect(s.text.length).toBeGreaterThan(10)); }
  });

  it('PDF: haqiqiy PDF, har til va rol uchun', async () => {
    for (const q of ['lang=uz', 'lang=ru&role=DRIVER', 'lang=en&role=FARMER']) {
      const r = await t.http().get(`/guide/pdf?${q}`).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toContain('application/pdf');
      expect(r.body.subarray(0, 5).toString()).toBe('%PDF-');
      expect(r.body.length).toBeGreaterThan(5000);
    }
  });
});
