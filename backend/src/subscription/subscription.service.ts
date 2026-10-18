import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PAYMENT_PROVIDER, PaymentProvider } from '../payment/provider/payment-provider';
import { ALLOWED_MONTHS, MONTHLY_PRICE_UZS, PERIOD_DAYS, TRIAL_DAYS, addDays, computeSubscription } from './subscription.logic';

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /** Barcha rollar uchun tariflar */
  plans() {
    return {
      trialDays: TRIAL_DAYS,
      periodDays: PERIOD_DAYS,
      months: ALLOWED_MONTHS,
      plans: [Role.FARMER, Role.DRIVER, Role.MARKET].map((role) => ({ role, monthlyUzs: MONTHLY_PRICE_UZS[role]! })),
    };
  }

  status(user: { role: Role; trialEndsAt?: Date | null; subscriptionEndsAt?: Date | null }) {
    return computeSubscription(user);
  }

  /** Obunani uzaytirish (hozir simulyatsiya). Yangi davr joriy kirish muddati tugagandan keyin boshlanadi, vaqt yo'qolmaydi. */
  async pay(user: { id: string; role: Role }, months: number) {
    const monthly = MONTHLY_PRICE_UZS[user.role];
    if (!monthly) throw new ForbiddenException("Bu rol uchun obuna talab qilinmaydi");
    const amount = monthly * months;
    const charge = await this.provider.charge({ paymentId: `sub-${user.id}`, amount: String(amount), currency: 'UZS' });

    const payment = await this.prisma.$transaction(async (tx) => {
      // Yangi holatni tranzaksiya ichida qayta o'qiymiz: bir vaqtdagi ikki to'lov davrlari ustma-ust tushmasin
      const fresh = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { role: true, trialEndsAt: true, subscriptionEndsAt: true } });
      const now = new Date();
      const info = computeSubscription(fresh, now);
      const periodStart = info.accessEndsAt && info.accessEndsAt > now ? info.accessEndsAt : now;
      const periodEnd = addDays(periodStart, PERIOD_DAYS * months);
      await tx.user.update({ where: { id: user.id }, data: { subscriptionEndsAt: periodEnd } });
      return tx.subscriptionPayment.create({
        data: { userId: user.id, role: user.role, months, amount, provider: this.provider.name, providerRef: charge.ref, periodStart, periodEnd },
      });
    });

    const fresh = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return { payment: this.present(payment), subscription: this.status(fresh) };
  }

  async history(userId: string) {
    const rows = await this.prisma.subscriptionPayment.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return rows.map((r) => this.present(r));
  }

  private present(p: { id: string; months: number; amount: unknown; provider: string; providerRef: string; periodStart: Date; periodEnd: Date; createdAt: Date }) {
    return {
      id: p.id, months: p.months, amountUzs: Number(p.amount), provider: p.provider, providerRef: p.providerRef,
      periodStart: p.periodStart, periodEnd: p.periodEnd, createdAt: p.createdAt,
    };
  }
}
