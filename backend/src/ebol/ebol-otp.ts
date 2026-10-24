import { createHash, createHmac, randomInt, timingSafeEqual } from 'crypto';

export type EBolKind = 'SHIPMENT' | 'LOCAL';

/** 4 xonali kod (0000-9999), kriptografik tasodifiy */
export const generatePickupCode = () => String(randomInt(0, 10_000)).padStart(4, '0');

/** Kod bazada ochiq saqlanmaydi: HMAC(kalit, tur:id:kod). Boshqa yukka olingan kod bu yukda ishlamaydi. */
export const hashPickupCode = (secret: string, kind: EBolKind, id: string, code: string) =>
  createHmac('sha256', secret).update(`ebol:${kind}:${id}:${code}`).digest('hex');

export function pickupCodeMatches(secret: string, kind: EBolKind, id: string, code: string, storedHash: string): boolean {
  const a = Buffer.from(hashPickupCode(secret, kind, id, code), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Shartnoma yozuvining o'zgarmas izi (SHA-256, kanonik JSON): keyinchalik buzilmaganini tekshirish uchun */
export function contractFingerprint(p: { kind: EBolKind; refId: string; driverId: string; farmerId: string; signedAt: Date }): string {
  const canonical = JSON.stringify({ v: 1, kind: p.kind, refId: p.refId, driverId: p.driverId, farmerId: p.farmerId, signedAt: p.signedAt.toISOString() });
  return createHash('sha256').update(canonical).digest('hex');
}

export const maskPhone = (phone: string) => (phone.length > 8 ? `${phone.slice(0, 7)}***${phone.slice(-2)}` : '***');
