import { randomInt } from 'crypto';

// Master QR kodi: "MQ-" + 8 belgi (o'xshash 0/O, 1/I harflarisiz): qo'lda kiritishga ham qulay
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const MASTER_QR_PATTERN = /^[A-Z0-9][A-Z0-9._-]{5,39}$/;

export function generateMasterQr(): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `MQ-${s}`;
}

/** Skanerdan kelgan yoki qo'lda yozilgan kod: bo'shliqsiz, katta harf */
export const normalizeQr = (raw: string) => raw.trim().replace(/\s+/g, '').toUpperCase();

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * "1 Master QR = N quti": bir quti vazni e'lon qilingan vazn / quti soni. Yaroqsiz qutilar qabul qilinmaydi.
 * Yig'indi har doim e'lon qilingan vaznga teng (damagedKg = declared - received), yaxlitlashda yo'qotish bo'lmaydi.
 */
export function osdSplit(declaredKg: number, boxCount: number, damagedBoxes: number) {
  const goodBoxes = boxCount - damagedBoxes;
  const receivedKg = round2((declaredKg * goodBoxes) / boxCount);
  return { goodBoxes, receivedKg, damagedKg: round2(declaredKg - receivedKg) };
}

export const packagingFee = (ratePerKg: number, kg: number) => round2(ratePerKg * kg);
