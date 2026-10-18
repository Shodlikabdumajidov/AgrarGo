import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { SettingsModule } from './settings/settings.module';
import { AuthModule } from './auth/auth.module';
import { BookingModule } from './booking/booking.module';
import { APP_ENV, AppEnvModule } from './config/app-env.module';
import { AppEnv } from './config/env.validation';
import { HealthController } from './health/health.controller';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { PaymentModule } from './payment/payment.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductModule } from './product/product.module';
import { ProfileModule } from './profile/profile.module';
import { AppThrottlerGuard } from './security/app-throttler.guard';
import { buildThrottlers } from './security/throttling';
import { ShipmentModule } from './shipment/shipment.module';
import { SmsModule } from './sms/sms.module';
import { WarehouseModule } from './warehouse/warehouse.module';

@Module({
  imports: [
    // Faqat .env faylini process.env ga yuklaydi. Testlar dasturchining .env fayliga (haqiqiy bazaga) tegmaydi.
    // Qiymatlarni tekshirish AppEnvModule'da, ilova yig'ilayotganda bajariladi.
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: process.env.NODE_ENV === 'test' }),
    AppEnvModule,
    SmsModule,
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
    ShipmentModule,
    PaymentModule,
    WarehouseModule,
    SettingsModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class AppModule {}
