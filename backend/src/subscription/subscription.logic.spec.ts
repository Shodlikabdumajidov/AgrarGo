import { Role } from '@prisma/client';
import { addDays, computeSubscription } from './subscription.logic';

describe('computeSubscription', () => {
  const now = new Date('2026-10-19T10:00:00Z');
  it('sinov davri', () => {
    const i = computeSubscription({ role: Role.FARMER, trialEndsAt: addDays(now, 10) }, now);
    expect(i).toMatchObject({ state: 'TRIAL', hasAccess: true, daysLeft: 10, priceUzs: 49000, expiringSoon: false });
  });
  it('7 kun qolganda tugayapti', () => {
    expect(computeSubscription({ role: Role.DRIVER, trialEndsAt: addDays(now, 3) }, now).expiringSoon).toBe(true);
  });
  it('tugagan va hech narsa yo\'q', () => {
    expect(computeSubscription({ role: Role.MARKET, trialEndsAt: addDays(now, -1) }, now)).toMatchObject({ state: 'EXPIRED', hasAccess: false, daysLeft: 0, priceUzs: 149000 });
    expect(computeSubscription({ role: Role.MARKET }, now).hasAccess).toBe(false);
  });
  it('kechroq sana hisobga olinadi', () => {
    const i = computeSubscription({ role: Role.FARMER, trialEndsAt: addDays(now, 5), subscriptionEndsAt: addDays(now, 40) }, now);
    expect(i).toMatchObject({ state: 'ACTIVE', daysLeft: 40 });
  });
  it('admin/dispetcher ozod', () => {
    expect(computeSubscription({ role: Role.ADMIN }, now)).toMatchObject({ state: 'EXEMPT', hasAccess: true });
    expect(computeSubscription({ role: Role.DISPATCHER }, now).hasAccess).toBe(true);
  });
});
