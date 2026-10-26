import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { SettingsModule } from './settings/settings.module';
import { AuthModule } from './auth/auth.module';
import { BookingModule } from './booking/booking.module';
import { ComplaintModule } from './complaint/complaint.module';
import { APP_ENV, AppEnvModule } from './config/app-env.module';
import { AppEnv } from './config/env.validation';
import { HealthController } from './health/health.controller';
import { DocumentsModule } from './documents/documents.module';
import { KycModule } from './kyc/kyc.module';
import { TrustModule } from './trust/trust.module';
import { PricingModule } from './pricing/pricing.module';
import { DriverPostModule } from './driver-post/driver-post.module';
import { GuideModule } from './guide/guide.module';
import { RatesModule } from './rates/rates.module';
import { CashbackModule } from './cashback/cashback.module';
import { HubModule } from './hub/hub.module';
import { LocalModule } from './local/local.module';
import { MarketPriceModule } from './market-price/market-price.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { PaymentModule } from './payment/payment.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductModule } from './product/product.module';
import { ProfileModule } from './profile/profile.module';
import { AppThrottlerGuard } from './security/app-throttler.guard';
import { buildThrottlers } from './security/throttling';
import { ReportsModule } from './reports/reports.module';
import { ReviewsModule } from './reviews/reviews.module';
import { ShipmentModule } from './shipment/shipment.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { SmsModule } from './sms/sms.module';
import { EBolModule } from './ebol/ebol.module';
import { SafetyModule } from './safety/safety.module';
import { FinanceModule } from './finance/finance.module';
import { TelegramModule } from './telegram/telegram.module';
import { WarehouseModule } from './warehouse/warehouse.module';

@Module({
  imports: [
    // Faqat .env faylini process.env ga yuklaydi. Testlar dasturchining .env fayliga (haqiqiy bazaga) tegmaydi.
    // Qiymatlarni tekshirish AppEnvModule'da, ilova yig'ilayotganda bajariladi.
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: process.env.NODE_ENV === 'test' }),
    AppEnvModule,
    SmsModule,
    EBolModule,
    SafetyModule,
    FinanceModule,
    TelegramModule,
    ThrottlerModule.forRootAsync({
      inject: [APP_ENV],
      useFactory: (env: AppEnv) => ({ throttlers: buildThrottlers(env) }),
    }),
    PrismaModule,
    AuthModule,
    ProductModule,
    MarketplaceModule,
    ProfileModule,
    BookingModule,
    ComplaintModule,
    ShipmentModule,
    PaymentModule,
    SubscriptionModule,
    MarketPriceModule,
    DriverPostModule,
    GuideModule,
    RatesModule,
    HubModule,
    CashbackModule,
    LocalModule,
    DocumentsModule,
    ReportsModule,
    TrustModule,
    PricingModule,
    KycModule,
    WarehouseModule,
    SettingsModule,
    ReviewsModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class AppModule {}
