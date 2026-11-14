import { Body, Controller, Delete, ForbiddenException, Get, Headers, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'crypto';
import { APP_ENV } from '../config/app-env.module';
import type { AppEnv } from '../config/env.validation';
import { TelegramBotService } from './telegram-bot.service';
import type { TelegramUpdate } from './telegram-api';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { ThrottleProfile } from '../security/throttle-profile';
import { TelegramService } from './telegram.service';

// Har qanday tizimga kirgan foydalanuvchi faqat o'z akkauntini bog'laydi/uzadi
@Controller('profile/telegram')
@UseGuards(JwtAuthGuard)
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  @Get()
  status(@CurrentUser() user: { id: string }) {
    return this.telegram.status(user.id);
  }

  @Post('link')
  @ThrottleProfile('telegram')
  link(@CurrentUser() user: { id: string }) {
    return this.telegram.createLinkToken(user.id);
  }

  @Delete()
  unlink(@CurrentUser() user: { id: string }) {
    return this.telegram.unlink(user.id);
  }
}

/**
 * Telegram webhook (TELEGRAM_WEBHOOK_URL berilganda): Telegram har bir yangilanishni shu manzilga yuboradi.
 * Faqat maxfiy sarlavha (X-Telegram-Bot-Api-Secret-Token) to'g'ri bo'lsa qabul qilinadi; javob doim tez (200).
 */
@Controller('telegram')
@SkipThrottle()
export class TelegramWebhookController {
  constructor(private readonly bot: TelegramBotService, @Inject(APP_ENV) private readonly env: AppEnv) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Headers('x-telegram-bot-api-secret-token') secret: string | undefined, @Body() update: TelegramUpdate) {
    const want = Buffer.from(this.env.TELEGRAM_WEBHOOK_SECRET || '\0');
    const got = Buffer.from(String(secret ?? ''));
    if (!this.env.TELEGRAM_WEBHOOK_URL || want.length !== got.length || !timingSafeEqual(want, got)) throw new ForbiddenException();
    await this.bot.handleUpdate(update).catch(() => undefined); // bot xatosi Telegram'ga qayta yuborishni (retry) keltirmasin
    return { ok: true };
  }
}
