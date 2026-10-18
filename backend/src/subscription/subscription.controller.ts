import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ThrottleProfile } from '../security/throttle-profile';
import { PaySubscriptionDto } from './dto/subscription.dto';
import { SubscriptionService } from './subscription.service';

@Controller('subscription')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubscriptionController {
  constructor(private readonly subscription: SubscriptionService) {}

  /** Joriy foydalanuvchining obuna holati (sinov/obuna, qolgan kunlar, tarif) */
  @Get()
  me(@CurrentUser() user: any) {
    return { ...this.subscription.status(user), ...this.subscription.plans() };
  }

  @Get('plans')
  plans() {
    return this.subscription.plans();
  }

  @Get('history')
  @Roles(Role.FARMER, Role.DRIVER, Role.MARKET)
  history(@CurrentUser() user: any) {
    return this.subscription.history(user.id);
  }

  /** Obunani 1/3/6/12 oyga uzaytirish. Sinov davri hali tugamagan bo'lsa ham qolgan kunlar saqlanadi. */
  @Post('pay')
  @HttpCode(200)
  @ThrottleProfile('payment')
  @Roles(Role.FARMER, Role.DRIVER, Role.MARKET)
  pay(@CurrentUser() user: any, @Body() dto: PaySubscriptionDto) {
    return this.subscription.pay(user, dto.months);
  }
}
