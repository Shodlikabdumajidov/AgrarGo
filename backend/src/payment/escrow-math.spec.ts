import { Prisma } from '@prisma/client';
import { damageRefund, packagingDeductions } from './escrow-math';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const base = { amount: 1_000_000, deliveryFee: 50_000, serviceFee: 20_000, feeAmount: 0, cashbackUsed: 0, isLocal: false };

describe('Escrow qayta hisoblash matematikasi', () => {
  it("50 ta qutidan 5 tasi: xaridorga 10% qaytadi, fermerga 90% qoladi", () => {
    const r = damageRefund(base, 5, 50, 'KEEP');
    expect(r.goods.toString()).toBe('100000');
    expect(D(base.amount).sub(r.goods).toString()).toBe('900000');
    expect(r.delivery.toString()).toBe('0'); // yo'l bosib o'tilgan: haydovchi to'liq oladi
    expect(r.service.toString()).toBe('2000');
    expect(r.refund.toString()).toBe('102000');
  });

  it("yo'l haqi PRORATE: tashilmagan yuk uchun nisbatan qirqiladi", () => {
    expect(damageRefund(base, 5, 50, 'PRORATE').delivery.toString()).toBe('5000');
  });

  it('chakana buyurtmada faqat mahsulot qaytadi; keshbek ishlatilgan bo\'lsa komissiya o\'zgarmaydi', () => {
    expect(damageRefund({ ...base, isLocal: true }, 5, 50, 'PRORATE')).toMatchObject({ delivery: D(0), service: D(0) });
    expect(damageRefund({ ...base, cashbackUsed: 1000 }, 5, 50, 'KEEP').service.toString()).toBe('0');
  });

  it("yaxlitlashda summa yo'qolmaydi: qaytarilgan + qolgan = asl", () => {
    for (const [amt, d, t] of [[100, 1, 3], [333.33, 2, 7], [999999.99, 13, 17]] as const) {
      const r = damageRefund({ ...base, amount: amt }, d, t, 'KEEP');
      expect(r.goods.add(D(amt).sub(r.goods)).toString()).toBe(D(amt).toString());
      expect(r.goods.lte(amt)).toBe(true);
    }
  });

  it("noto'g'ri qiymatlar rad etiladi", () => {
    for (const [d, t] of [[0, 10], [10, 10], [11, 10], [1, 1], [1.5, 10]] as const) expect(() => damageRefund(base, d, t, 'KEEP')).toThrow(RangeError);
  });

  it('qadoqlash haqi: navbat bilan, fermer ulushidan oshmaydi', () => {
    const dues = [{ id: 'a', due: 30_000 }, { id: 'b', due: 50_000 }];
    expect(packagingDeductions(100_000, dues).total.toString()).toBe('80000');
    const part = packagingDeductions(40_000, dues);
    expect(part.items.map((x) => [x.id, x.take.toString()])).toEqual([['a', '30000'], ['b', '10000']]);
    expect(packagingDeductions(0, dues).items).toHaveLength(0);
    expect(packagingDeductions(1000, []).total.toString()).toBe('0');
  });
});
