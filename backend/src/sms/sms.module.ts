import { Global, Module } from '@nestjs/common';
import { APP_ENV } from '../config/app-env.module';
import { AppEnv } from '../config/env.validation';
import { SMS_PROVIDER, SimulatedSmsProvider } from './sms-provider';

@Global()
@Module({
  providers: [
    // Haqiqiy provayder qo'shilganda faqat shu yerda almashtiriladi
    { provide: SMS_PROVIDER, inject: [APP_ENV], useFactory: (env: AppEnv) => new SimulatedSmsProvider(env.NODE_ENV !== 'production') },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}
