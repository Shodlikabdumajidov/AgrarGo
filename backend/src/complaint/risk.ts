import { ConflictException } from '@nestjs/common';

/** Shu ball va undan yuqori qizil yulduzda bitim oldidan rasmiy ogohlantirish (DQQ) ko'rsatiladi */
export const RISK_WARNING_POINTS = 2;
/** Shu ballga yetgan akkaunt avtomatik BANNED bo'ladi */
export const BAN_POINTS = 5;

export const RISK_MESSAGE = (points: number) =>
  `DQQ OGOHLANTIRISHI: Ushbu hamkor shartnoma majburiyatlarini buzganligi va asossiz bekor qilishlar sababli platforma xavfsizlik tizimi tomonidan red-flag (${points}/${BAN_POINTS} qizil daraja) olgan. Ushbu hamkor bilan ishlash yuqori moliyaviy va logistik xavf tug'dirishi mumkin. Ishlashni tasdiqlaysizmi?`;

/** Hamkor qizil yulduzi 2 va undan yuqori bo'lsa, mijoz ogohlantirishni tasdiqlamaguncha (acknowledgeRisk) bitim tuzilmaydi */
export function assertRiskAcknowledged(partnerPoints: number | null | undefined, acknowledged: boolean | undefined) {
  const p = partnerPoints ?? 0;
  if (p >= RISK_WARNING_POINTS && !acknowledged) {
    throw new ConflictException({ statusCode: 409, error: 'Conflict', code: 'RISK_WARNING', penaltyPoints: p, message: RISK_MESSAGE(p) });
  }
}
