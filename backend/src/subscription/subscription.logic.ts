import { Role } from '@prisma/client';

/** Bepul sinov muddati (kun) va bitta oylik obuna davri (kun). */
export const TRIAL_DAYS = 30;
export const PERIOD_DAYS = 30;
/** Eslatma bannerlari uchun: shu kundan kam qolganda "tugayapti" holati */
export const EXPIRING_SOON_DAYS = 7;

/** Oylik tariflar (so'm). Server hisoblaydi — mijozdan summa qabul qilinmaydi. */
export const MONTHLY_PRICE_UZS: Partial<Record<Role, number>> = {
  [Role.FARMER]: 49_000,
  [Role.DRIVER]: 79_000,
  [Role.MARKET]: 149_000,
};
export const ALLOWED_MONTHS = [1, 3, 6, 12] as const;

const DAY_MS = 24 * 60 * 60 * 1000;
export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY_MS);

export const trialEndsFromNow = (from = new Date()) => addDays(from, TRIAL_DAYS);

export type SubscriptionState = 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'EXEMPT';

export interface SubscriptionInfo {
  state: SubscriptionState;
  hasAccess: boolean;
  role: Role;
  priceUzs: number | null;
  trialEndsAt: Date | null;
  subscriptionEndsAt: Date | null;
  /** Kirish huquqi tugaydigan sana (sinov yoki obunadan kechrog'i) */
  accessEndsAt: Date | null;
  /** To'liq kunlarda (yuqoriga yaxlitlangan); tugagan bo'lsa 0 */
  daysLeft: number;
  expiringSoon: boolean;
}

interface SubscriptionSubject {
  role: Role;
  trialEndsAt?: Date | null;
  subscriptionEndsAt?: Date | null;
}

/** Sof funksiya: foydalanuvchining obuna holatini hisoblaydi (DB'ga murojaat qilmaydi). */
export function computeSubscription(user: SubscriptionSubject, now = new Date()): SubscriptionInfo {
  const priceUzs = MONTHLY_PRICE_UZS[user.role] ?? null;
  const trialEndsAt = user.trialEndsAt ?? null;
  const subscriptionEndsAt = user.subscriptionEndsAt ?? null;
  // Obuna talab qilinmaydigan rollar: administrator va ombor dispetcheri
  if (priceUzs === null) {
    return { state: 'EXEMPT', hasAccess: true, role: user.role, priceUzs, trialEndsAt, subscriptionEndsAt, accessEndsAt: null, daysLeft: 0, expiringSoon: false };
  }
  const ends = [trialEndsAt, subscriptionEndsAt].filter((d): d is Date => !!d);
  const accessEndsAt = ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null;
  const hasAccess = !!accessEndsAt && accessEndsAt.getTime() > now.getTime();
  const paidActive = !!subscriptionEndsAt && subscriptionEndsAt.getTime() > now.getTime();
  const state: SubscriptionState = !hasAccess ? 'EXPIRED' : paidActive ? 'ACTIVE' : 'TRIAL';
  const daysLeft = hasAccess ? Math.ceil((accessEndsAt!.getTime() - now.getTime()) / DAY_MS) : 0;
  return { state, hasAccess, role: user.role, priceUzs, trialEndsAt, subscriptionEndsAt, accessEndsAt, daysLeft, expiringSoon: hasAccess && daysLeft <= EXPIRING_SOON_DAYS };
}
