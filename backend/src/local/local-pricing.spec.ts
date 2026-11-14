import { Prisma } from '@prisma/client';
import { codesMatch, localQuote, localSplits, splitCourierFee, withCourierFee } from './local-pricing';

const cfg = { hubPercent: 5, hubMin: 2000, courierFee: 12000, servicePercent: 3, serviceMin: 500 };

describe('localQuote: chakana buyurtma narx tarkibi', () => {
  it('10 kg × 4 500: mahsulot, Hub, kuryer, platforma; jami = yig\'indi', () => {
    const q = localQuote(cfg, 10, 4500);
    expect(q.productAmount.toNumber()).toBe(45000);
    expect(q.hubFee.toNumber()).toBe(2300); // 5% = 2250 -> 2300
    expect(q.courierFee.toNumber()).toBe(12000);
    expect(q.serviceFee.toNumber()).toBe(1400); // 3% = 1350 -> 1400
    expect(q.total.toNumber()).toBe(45000 + 2300 + 12000 + 1400);
  });

  it('minimumlar: arzon mahsulotda Hub va platforma haqi minimumga teng', () => {
    const q = localQuote(cfg, 10, 500); // 5000 so'm
    expect(q.hubFee.toNumber()).toBe(2000);
    expect(q.serviceFee.toNumber()).toBe(500);
  });

  it('taqsimot yig\'indisi jamiga teng; kasr miqdor tiyingacha yaxlitlanadi', () => {
    for (const [qty, price] of [[10, 4500], [12.5, 3333.33], [200, 15000], [10.25, 999]] as const) {
      const q = localQuote(cfg, qty, price);
      const sum = localSplits(q).reduce((a, s) => a.add(s.amount), new Prisma.Decimal(0));
      expect(sum.equals(q.total)).toBe(true);
    }
    expect(localQuote(cfg, 12.5, 3333.33).productAmount.toString()).toBe('41666.63');
  });

  it("0% sozlamada ham minimumlar saqlanadi; foizlar 0 bo'lsa va minimum 0 bo'lsa haq olinmaydi", () => {
    const free = localQuote({ ...cfg, hubPercent: 0, hubMin: 0, servicePercent: 0, serviceMin: 0 }, 10, 4500);
    expect(free.hubFee.toNumber()).toBe(0);
    expect(free.serviceFee.toNumber()).toBe(0);
    expect(free.total.toNumber()).toBe(45000 + 12000);
  });
});

describe('codesMatch', () => {
  it('doimiy vaqtli solishtirish', () => {
    expect(codesMatch('1234', '1234')).toBe(true);
    expect(codesMatch('1234', '1235')).toBe(false);
    expect(codesMatch('1234', '123')).toBe(false);
  });
});

describe('splitCourierFee', () => {
  const sum = (a: any[]) => a.reduce((x, y) => x.add(y), new Prisma.Decimal(0));
  it('yig\'indi to\'liq haqqa teng, farq 1 tiyindan oshmaydi', () => {
    for (const [fee, n] of [[12000, 1], [12000, 2], [12000, 3], [10000, 3], [12000.01, 4], [100, 7]] as [number, number][]) {
      const parts = splitCourierFee(fee, n);
      expect(parts).toHaveLength(n);
      expect(sum(parts).toFixed(2)).toBe(new Prisma.Decimal(fee).toFixed(2));
      const nums = parts.map(Number);
      expect(Math.max(...nums) - Math.min(...nums)).toBeLessThanOrEqual(0.0100001);
    }
  });
  it('withCourierFee jami yig\'indisini saqlaydi', () => {
    const q = localQuote(cfg, 10, 4000);
    const r = withCourierFee(q, new Prisma.Decimal(6000));
    expect(r.total.toFixed(2)).toBe(q.productAmount.add(q.hubFee).add(6000).add(q.serviceFee).toFixed(2));
  });
});
