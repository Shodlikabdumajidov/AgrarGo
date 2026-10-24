import { Global, Module } from '@nestjs/common';
import { AppEnv, validateEnv } from './env.validation';

/** Tekshirilgan sozlamalar uchun DI kaliti: `@Inject(APP_ENV) env: AppEnv` */
export const APP_ENV = 'APP_ENV';

/**
 * Sozlamalar ilova yig'ilayotgan paytda (import paytida emas) tekshiriladi.
 * Noto'g'ri sozlama bo'lsa server ko'tarilmaydi va xato sabablari birdan ko'rsatiladi.
 */
@Global()
@Module({
  providers: [{ provide: APP_ENV, useFactory: (): AppEnv => validateEnv(process.env) }],
  exports: [APP_ENV],
})
export class AppEnvModule {}
