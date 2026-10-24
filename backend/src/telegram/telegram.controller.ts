import { Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
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
