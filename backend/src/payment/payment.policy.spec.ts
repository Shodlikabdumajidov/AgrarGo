import { PaymentStatus as P, ShipmentStatus as S } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { computeAmount } from './payment.factory';
import { PolicyContext, payDecision, refundDecision, releaseDecision } from './payment.policy';

const NOW = new Date('2026-10-20T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const ctx = (over: Partial<PolicyContext> = {}): PolicyContext => ({
  paymentStatus: P.HELD, shipmentStatus: S.OPEN, deliveredAt: null, now: NOW, graceHours: 72, ...over,
});
const delivered = (hours: number, over: Partial<PolicyContext> = {}) =>
  ctx({ shipmentStatus: S.DELIVERED, deliveredAt: hoursAgo(hours), ...over });

describe('computeAmount', () => {
  it('miqdor x narx, 2 xonagacha yaxlitlanadi', () => {
    expect(computeAmount(150.5, 4500).toFixed(2)).toBe('677250.00');
    expect(computeAmount('0.01', '0.01').toFixed(2)).toBe('0.00');
    expect(computeAmount('0.03', '0.05').toFixed(2)).toBe('0.00'); // 0.0015 -> 0.00
    expect(computeAmount('1.15', '0.50').toFixed(2)).toBe('0.58'); // 0.575 -> 0.58 (half up)
  });

  it("katta qiymatlarda aniqlikni yo'qotmaydi (float emas)", () => {
    expect(computeAmount('9999999999.99', '9999999999.99').toFixed(2)).toBe('99999999999800000000.00');
    expect(computeAmount(new Prisma.Decimal('0.1'), '0.2').toFixed(2)).toBe('0.02');
  });
});

describe("payDecision", () => {
  it("faqat xaridor, faqat kutilayotgan to'lov", () => {
    expect(payDecision('MARKET', ctx({ paymentStatus: P.PENDING })).allowed).toBe(true);
    expect(payDecision('FARMER', ctx({ paymentStatus: P.PENDING })).allowed).toBe(false);
    expect(payDecision('ADMIN', ctx({ paymentStatus: P.PENDING })).allowed).toBe(false);
    for (const status of [P.HELD, P.RELEASED, P.REFUNDED, P.CANCELLED]) {
      expect(payDecision('MARKET', ctx({ paymentStatus: status })).allowed).toBe(false);
    }
  });
});

describe('releaseDecision', () => {
  it("escrow'da bo'lmagan to'lovni hech kim chiqara olmaydi (admin ham)", () => {
    for (const status of [P.PENDING, P.RELEASED, P.REFUNDED, P.CANCELLED]) {
      for (const actor of ['MARKET', 'FARMER', 'ADMIN'] as const) {
        expect(releaseDecision(actor, delivered(1000, { paymentStatus: status })).allowed).toBe(false);
      }
    }
  });

  it('yuk yetkazilmaguncha xaridor va fermer chiqara olmaydi, admin mumkin', () => {
    for (const shipmentStatus of [S.OPEN, S.LOADING, S.IN_TRANSIT, null]) {
      expect(releaseDecision('MARKET', ctx({ shipmentStatus })).allowed).toBe(false);
      expect(releaseDecision('FARMER', ctx({ shipmentStatus })).allowed).toBe(false);
      expect(releaseDecision('ADMIN', ctx({ shipmentStatus })).allowed).toBe(true);
    }
  });

  it("xaridor yetkazilgach darhol tasdiqlay oladi", () => {
    expect(releaseDecision('MARKET', delivered(0)).allowed).toBe(true);
  });

  it("fermer faqat himoya muddati (72 soat) o'tgach oladi", () => {
    const early = releaseDecision('FARMER', delivered(10));
    expect(early.allowed).toBe(false);
    expect(early).toMatchObject({ reason: expect.stringMatching(/72 soat kutiladi.*62 soat/) });
    expect(releaseDecision('FARMER', delivered(71.9)).allowed).toBe(false);
    expect(releaseDecision('FARMER', delivered(72)).allowed).toBe(true);
    expect(releaseDecision('FARMER', delivered(500)).allowed).toBe(true);
  });

  it("himoya muddati 0 bo'lsa fermer darhol oladi; yetkazilgan vaqt yo'q bo'lsa rad etiladi", () => {
    expect(releaseDecision('FARMER', delivered(0, { graceHours: 0 })).allowed).toBe(true);
    expect(releaseDecision('FARMER', ctx({ shipmentStatus: S.DELIVERED, deliveredAt: null })).allowed).toBe(false);
  });
});

describe('refundDecision', () => {
  describe("to'lanmagan (PENDING)", () => {
    it('xaridor, fermer va admin pul harakatisiz bekor qila oladi (CANCELLED)', () => {
      for (const actor of ['MARKET', 'FARMER', 'ADMIN'] as const) {
        expect(refundDecision(actor, ctx({ paymentStatus: P.PENDING }))).toEqual({ allowed: true, effect: 'CANCEL_ORDER', target: P.CANCELLED });
      }
    });
  });

  describe("escrow'da (HELD)", () => {
    it("xaridor faqat haydovchi biriktirilmagan (OPEN) yukni bekor qila oladi", () => {
      expect(refundDecision('MARKET', ctx({ shipmentStatus: S.OPEN }))).toEqual({ allowed: true, effect: 'CANCEL_ORDER', target: P.REFUNDED });
      for (const s of [S.LOADING, S.IN_TRANSIT, S.DELIVERED]) {
        expect(refundDecision('MARKET', ctx({ shipmentStatus: s })).allowed).toBe(false);
      }
    });

    it("fermer yo'lga chiqmaguncha (OPEN, LOADING) qaytara oladi, keyin faqat admin", () => {
      expect(refundDecision('FARMER', ctx({ shipmentStatus: S.OPEN })).allowed).toBe(true);
      expect(refundDecision('FARMER', ctx({ shipmentStatus: S.LOADING })).allowed).toBe(true);
      expect(refundDecision('FARMER', ctx({ shipmentStatus: S.IN_TRANSIT })).allowed).toBe(false);
      expect(refundDecision('FARMER', ctx({ shipmentStatus: S.DELIVERED })).allowed).toBe(false);
    });

    it("admin istalgan paytda qaytaradi; yo'lda/yetkazilgan yukda buyurtmaga tegmaydi (MONEY_ONLY)", () => {
      expect(refundDecision('ADMIN', ctx({ shipmentStatus: S.OPEN }))).toMatchObject({ allowed: true, effect: 'CANCEL_ORDER' });
      expect(refundDecision('ADMIN', ctx({ shipmentStatus: S.LOADING }))).toMatchObject({ allowed: true, effect: 'CANCEL_ORDER' });
      expect(refundDecision('ADMIN', ctx({ shipmentStatus: S.IN_TRANSIT }))).toMatchObject({ allowed: true, effect: 'MONEY_ONLY' });
      expect(refundDecision('ADMIN', delivered(1))).toMatchObject({ allowed: true, effect: 'MONEY_ONLY', target: P.REFUNDED });
    });
  });

  it("yopilgan to'lovlar (RELEASED, REFUNDED, CANCELLED) qayta qaytarilmaydi", () => {
    for (const status of [P.RELEASED, P.REFUNDED, P.CANCELLED]) {
      for (const actor of ['MARKET', 'FARMER', 'ADMIN'] as const) {
        expect(refundDecision(actor, ctx({ paymentStatus: status })).allowed).toBe(false);
      }
    }
  });
});
