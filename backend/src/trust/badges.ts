import { Role } from '@prisma/client';

export type Tier = 'master' | 'pro' | 'legendary';
export type RoleGroup = 'DRIVER' | 'FARMER' | 'MARKET';

export interface Metrics {
  role: Role;
  ageDays: number;
  verified: boolean;
  deals: number;
  rating: { avg: number; count: number };
  driver: {
    delivered: number; onTime: number; damageReports: number; nightLong: number; reefer: number; ecoReturn: number;
    fiveStars: number; friendly: number; km: number; eldStreak: number; urgent: number; paidMonths: number; subActive: boolean;
  };
  farmer: { weightKg: number; fastApprovals: number; decided: number; rejected: number };
  market: { paidPayments: number; refunded: number; weightKg: number };
}

export interface BadgeDef {
  id: string; group: RoleGroup; tier: Tier; icon: string; weight: number; target: number;
  /** Joriy qiymat (target bilan solishtiriladi) */
  value: (m: Metrics) => number;
  /** Qo'shimcha shart (masalan, reyting); bajarilmasa qulf ochilmaydi */
  also?: (m: Metrics) => boolean;
}

const ratingOk = (min: number, minCount: number) => (m: Metrics) => m.rating.count >= minCount && m.rating.avg >= min;

export const BADGES: BadgeDef[] = [
  // ----- Haydovchi: 15 ta -----
  { id: 'verified_pro', group: 'DRIVER', tier: 'master', icon: '🆔', weight: 60, target: 1, value: (m) => (m.verified ? 1 : 0) },
  { id: 'speedy', group: 'DRIVER', tier: 'master', icon: '⚡', weight: 50, target: 10, value: (m) => m.driver.onTime },
  { id: 'safe_hauler', group: 'DRIVER', tier: 'pro', icon: '🛡', weight: 70, target: 25, value: (m) => m.driver.delivered, also: (m) => m.driver.damageReports === 0 },
  { id: 'rookie', group: 'DRIVER', tier: 'master', icon: '🥉', weight: 10, target: 1, value: (m) => m.driver.delivered },
  { id: 'master_driver', group: 'DRIVER', tier: 'pro', icon: '🥈', weight: 75, target: 25, value: (m) => m.driver.delivered },
  { id: 'legendary_pro', group: 'DRIVER', tier: 'legendary', icon: '🥇', weight: 95, target: 100, value: (m) => m.driver.delivered, also: ratingOk(4.9, 10) },
  { id: 'night_rider', group: 'DRIVER', tier: 'pro', icon: '🌙', weight: 55, target: 5, value: (m) => m.driver.nightLong },
  { id: 'reefer_expert', group: 'DRIVER', tier: 'pro', icon: '❄️', weight: 65, target: 10, value: (m) => m.driver.reefer },
  { id: 'eco_return', group: 'DRIVER', tier: 'master', icon: '🔄', weight: 45, target: 10, value: (m) => m.driver.ecoReturn },
  { id: 'top_rated', group: 'DRIVER', tier: 'legendary', icon: '🌟', weight: 90, target: 50, value: (m) => m.driver.fiveStars },
  { id: 'long_distance', group: 'DRIVER', tier: 'pro', icon: '🛣', weight: 62, target: 3000, value: (m) => m.driver.km },
  { id: 'eld_master', group: 'DRIVER', tier: 'pro', icon: '📋', weight: 58, target: 14, value: (m) => m.driver.eldStreak },
  { id: 'friendly', group: 'DRIVER', tier: 'master', icon: '🤝', weight: 40, target: 15, value: (m) => m.driver.friendly },
  { id: 'emergency', group: 'DRIVER', tier: 'master', icon: '🚀', weight: 52, target: 5, value: (m) => m.driver.urgent },
  { id: 'vip_champion', group: 'DRIVER', tier: 'legendary', icon: '🏛', weight: 100, target: 50, value: (m) => m.driver.delivered,
    also: (m) => m.verified && m.driver.subActive && m.driver.paidMonths >= 12 },
  // ----- Fermer: 4 ta -----
  { id: 'quality_guarantee', group: 'FARMER', tier: 'pro', icon: '🌾', weight: 80, target: 10, value: (m) => m.rating.count, also: ratingOk(4.7, 10) },
  { id: 'big_harvest', group: 'FARMER', tier: 'pro', icon: '🚜', weight: 70, target: 50000, value: (m) => m.farmer.weightKg },
  { id: 'honest_farmer', group: 'FARMER', tier: 'master', icon: '🏅', weight: 75, target: 10, value: (m) => m.deals, also: (m) => m.verified && m.farmer.decided > 0 && m.farmer.rejected / m.farmer.decided <= 0.1 },
  { id: 'fast_loader', group: 'FARMER', tier: 'master', icon: '⚡', weight: 60, target: 10, value: (m) => m.farmer.fastApprovals },
  // ----- Market: 3 ta -----
  { id: 'escrow_master', group: 'MARKET', tier: 'pro', icon: '💰', weight: 85, target: 10, value: (m) => m.market.paidPayments, also: (m) => m.market.refunded === 0 },
  { id: 'bulk_buyer', group: 'MARKET', tier: 'master', icon: '🛒', weight: 65, target: 20000, value: (m) => m.market.weightKg },
  { id: 'reliable_partner', group: 'MARKET', tier: 'pro', icon: '🤝', weight: 75, target: 10, value: (m) => m.deals, also: ratingOk(4.5, 5) },
];

export interface BadgeState {
  id: string; group: RoleGroup; tier: Tier; icon: string; weight: number;
  current: number; target: number; progress: number; unlocked: boolean;
}

const groupOf = (role: Role): RoleGroup | null => (role === Role.DRIVER ? 'DRIVER' : role === Role.FARMER ? 'FARMER' : role === Role.MARKET ? 'MARKET' : null);

export function evaluateBadges(m: Metrics): BadgeState[] {
  const g = groupOf(m.role);
  return BADGES.filter((b) => b.group === g).map((b) => {
    const current = Math.round(b.value(m) * 100) / 100;
    const unlocked = current >= b.target && (b.also ? b.also(m) : true);
    return { id: b.id, group: b.group, tier: b.tier, icon: b.icon, weight: b.weight, current, target: b.target, progress: Math.min(1, current / b.target), unlocked };
  });
}

export type TrustStatus = 'NEW' | 'REGULAR' | 'VETERAN';
/** Yangi: 30 kundan kam (yoki shartlar bajarilmagan). Doimiy: >30 kun, tasdiqlangan, 5+ bitim. Qadrdon: >180 kun, tasdiqlangan, 30+ bitim, reyting 4.8+ */
export function trustStatus(m: Metrics): TrustStatus {
  if (m.ageDays > 180 && m.verified && m.deals >= 30 && m.rating.count >= 5 && m.rating.avg >= 4.8) return 'VETERAN';
  if (m.ageDays > 30 && m.verified && m.deals >= 5) return 'REGULAR';
  return 'NEW';
}

/** Haydovchi darajasi: eng yuqori ochilgan "yo'l" badji bo'yicha */
export function driverRank(states: BadgeState[]): 'LEGENDARY' | 'MASTER' | 'ROOKIE' | null {
  const has = (id: string) => states.some((s) => s.id === id && s.unlocked);
  return has('legendary_pro') ? 'LEGENDARY' : has('master_driver') ? 'MASTER' : has('rookie') ? 'ROOKIE' : null;
}
