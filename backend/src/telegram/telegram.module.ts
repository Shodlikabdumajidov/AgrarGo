import { Global, Module } from '@nestjs/common';
import { APP_ENV } from '../config/app-env.module';
import { AppEnv } from '../config/env.validation';
import { NotificationService } from './notification.service';
import { HttpTelegramApi, TELEGRAM_API } from './telegram-api';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';

@Global()
@Module({
  controllers: [TelegramController],
  providers: [
    // Token berilmasa null: bot va xabarnomalar butunlay o'chiq, qolgan tizim ishlayveradi
    { provide: TELEGRAM_API, inject: [APP_ENV], useFactory: (env: AppEnv) => (env.TELEGRAM_BOT_TOKEN ? new HttpTelegramApi(env.TELEGRAM_BOT_TOKEN) : null) },
    TelegramService,
    TelegramBotService,
    NotificationService,
  ],
  exports: [NotificationService, TelegramService],
})
export class TelegramModule {}
