import { Controller, Get, Header } from '@nestjs/common';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Saytning ochiq ma'lumotlari (call-center, email, ijtimoiy tarmoqlar, ish vaqti). Keshlanmaydi: o'zgarish darhol ko'rinadi. */
  @Get('public')
  @Header('Cache-Control', 'no-cache, must-revalidate')
  publicSettings() {
    return this.settings.getPublic();
  }
}
