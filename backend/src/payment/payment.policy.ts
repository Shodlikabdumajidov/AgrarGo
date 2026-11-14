import { PaymentStatus, ShipmentStatus } from '@prisma/client';

// Kim va qachon pulni chiqara/qaytara olishi shu yerda, sof funksiyalar sifatida (bazasiz testlanadi).

export type PaymentActor = 'MARKET' | 'FARMER' | 'ADMIN';

export interface PolicyContext {
  paymentStatus: PaymentStatus;
  shipmentStatus: ShipmentStatus | null;
  deliveredAt: Date | null;
  now: Date;
  graceHours: number;
}

export type Decision<T = object> = ({ allowed: true } & T) | { allowed: false; reason: string };

const HOUR = 3_600_000;
const deny = (reason: string) => ({ allowed: false as const, reason });

/** Xaridor to'laydi: faqat kutilayotgan to'lov uchun. */
export function payDecision(actor: PaymentActor, ctx: Pick<PolicyContext, 'paymentStatus' | 'shipmentStatus'>): Decision {
  if (actor !== 'MARKET') return deny("To'lovni faqat xaridor (market) amalga oshiradi");
  if (ctx.paymentStatus !== PaymentStatus.PENDING) return deny(`To'lov allaqachon amalga oshirilgan yoki yopilgan (holati: ${ctx.paymentStatus})`);
  if (ctx.shipmentStatus === ShipmentStatus.CANCELLED) return deny('Buyurtma bekor qilingan');
  return { allowed: true };
}

/**
 * Pulni fermerga chiqarish (HELD -> RELEASED).
 *  - ADMIN: istalgan vaqtda (nizoni hal qilish)
 *  - MARKET: yuk yetkazib berilgach (qabul qilganini tasdiqlaydi)
 *  - FARMER: yuk yetkazilgach va xaridor `graceHours` soat davomida e'tiroz bildirmagan bo'lsa
 */
export function releaseDecision(actor: PaymentActor, ctx: PolicyContext): Decision {
  if (ctx.paymentStatus !== PaymentStatus.HELD) {
    return deny(`Pul escrow'da emas (to'lov holati: ${ctx.paymentStatus})`);
  }
  if (actor === 'ADMIN') return { allowed: true };

  if (ctx.shipmentStatus !== ShipmentStatus.DELIVERED) {
    return deny('Pul faqat yuk yetkazib berilgandan keyin chiqariladi');
  }
  if (actor === 'MARKET') return { allowed: true };

  const deliveredAt = ctx.deliveredAt?.getTime();
  if (deliveredAt === undefined) return deny('Yetkazib berilgan vaqt noma\'lum');
  const readyAt = deliveredAt + ctx.graceHours * HOUR;
  if (ctx.now.getTime() < readyAt) {
    const left = Math.ceil((readyAt - ctx.now.getTime()) / HOUR);
    return deny(`Xaridor tasdiqlashi uchun ${ctx.graceHours} soat kutiladi (qolgan: taxminan ${left} soat)`);
  }
  return { allowed: true };
}

export type RefundEffect =
  | 'CANCEL_ORDER' // buyurtma bekor qilinadi: bron CANCELLED, yuk CANCELLED, miqdor e'longa qaytadi
  | 'MONEY_ONLY';  // faqat pul qaytadi (yuk allaqachon yo'lda/yetkazilgan: nizo, faqat administrator)

/**
 * Bekor qilish / qaytarish:
 *  - PENDING (to'lanmagan): xaridor, fermer yoki admin bekor qiladi -> CANCELLED (pul harakati yo'q)
 *  - HELD: xaridor faqat haydovchi biriktirilgunga qadar (yuk OPEN), fermer yo'lga chiqmaguncha (OPEN/LOADING),
 *          admin istalgan paytda. Yo'lda/yetkazilgan yukda faqat admin: buyurtma o'zgarmaydi, pul qaytadi.
 */
export function refundDecision(actor: PaymentActor, ctx: PolicyContext): Decision<{ effect: RefundEffect; target: PaymentStatus }> {
  const ship = ctx.shipmentStatus;
  const notDeparted = ship === ShipmentStatus.OPEN || ship === ShipmentStatus.LOADING;

  if (ctx.paymentStatus === PaymentStatus.PENDING) {
    return { allowed: true, effect: 'CANCEL_ORDER', target: PaymentStatus.CANCELLED };
  }
  if (ctx.paymentStatus !== PaymentStatus.HELD) {
    return deny(`Qaytarib bo'lmaydi (to'lov holati: ${ctx.paymentStatus})`);
  }

  if (actor === 'ADMIN') {
    return { allowed: true, effect: notDeparted ? 'CANCEL_ORDER' : 'MONEY_ONLY', target: PaymentStatus.REFUNDED };
  }
  if (actor === 'FARMER') {
    if (notDeparted) return { allowed: true, effect: 'CANCEL_ORDER', target: PaymentStatus.REFUNDED };
    return deny("Yuk yo'lga chiqqandan keyin pulni faqat administrator qaytara oladi");
  }
  if (ship === ShipmentStatus.OPEN) return { allowed: true, effect: 'CANCEL_ORDER', target: PaymentStatus.REFUNDED };
  return deny("Haydovchi biriktirilgandan keyin xaridor bekor qila olmaydi. Administratorga murojaat qiling");
}
