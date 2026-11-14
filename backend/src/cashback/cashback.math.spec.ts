import { Prisma } from '@prisma/client';
import { allocateCashback, cashbackAmount, maxSpendable } from './cashback.math';

const sum = (a: Prisma.Decimal[]) => a.reduce((x, y) => x.add(y), new Prisma.Decimal(0));

describe('cashback.math', () => {
  it('cashbackAmount: foiz, tiyingacha pastga', () => {
    expect(cashbackAmount(90000, 1).toFixed(2)).toBe('900.00');
    expect(cashbackAmount('12345.67', 1).toFixed(2)).toBe('123.45'); // 123.4567 -> pastga
    expect(cashbackAmount(1000, 0).toFixed(2)).toBe('0.00');
    expect(cashbackAmount(0, 5).toFixed(2)).toBe('0.00');
  });

  it("maxSpendable: balans va xizmat haqi chegarasi", () => {
    expect(maxSpendable(5000, 2700, 100).toFixed(2)).toBe('2700.00');
    expect(maxSpendable(1000, 2700, 100).toFixed(2)).toBe('1000.00');
    expect(maxSpendable(5000, 2700, 50).toFixed(2)).toBe('1350.00');
    expect(maxSpendable(0, 2700, 100).toFixed(2)).toBe('0.00');
    expect(maxSpendable(5000, 2700, 0).toFixed(2)).toBe('0.00');
  });

  it("allocateCashback: yig'indi aniq, hech biri sig'imdan oshmaydi", () => {
    const caps = [2700, 1300, 500];
    for (const total of [0, 1, 999.99, 2000, 4500, 9999]) {
      const parts = allocateCashback(total, caps);
      expect(sum(parts).toFixed(2)).toBe(Prisma.Decimal.min(total, 4500).toFixed(2));
      parts.forEach((p, i) => expect(p.lte(caps[i])).toBe(true));
    }
    expect(allocateCashback(100, [0, 0]).every((p) => p.eq(0))).toBe(true);
  });
});
