import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { APP_ENV } from '../config/app-env.module';
import { AppEnv } from '../config/env.validation';
import { DeliveryFormula, PricingConfig, Quote, deliveryFormula, quote } from './pricing';

@Injectable()
export class PricingService {
  readonly cfg: PricingConfig;
  constructor(@Inject(APP_ENV) env: AppEnv) {
    this.cfg = { deliveryBase: env.DELIVERY_BASE_FEE, deliveryPerKm: env.DELIVERY_FEE_PER_KM, deliveryPerTonKm: env.DELIVERY_FEE_PER_TON_KM, servicePercent: env.SERVICE_FEE_PERCENT };
  }

  formula(distanceKm: number, weightKg: Prisma.Decimal.Value, storedFee?: Prisma.Decimal.Value): DeliveryFormula {
    return deliveryFormula(this.cfg, distanceKm, weightKg, storedFee);
  }

  /** Marshrut (viloyatlar), mahsulot summasi va og'irlik bo'yicha to'lov tarkibini hisoblaydi */
  quote(originRegion: string, destRegion: string, productPrice: Prisma.Decimal.Value, weightKg: Prisma.Decimal.Value): Quote {
    return quote(this.cfg, originRegion, destRegion, productPrice, weightKg);
  }
}
