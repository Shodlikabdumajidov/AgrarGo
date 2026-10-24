import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ThrottleProfile } from '../security/throttle-profile';
import { CreateRatingDto } from './ratings.dto';
import { RatingsService } from './ratings.service';
import { TrustService } from './trust.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class TrustController {
  constructor(private readonly trust: TrustService, private readonly ratings: RatingsService) {}

  /** O'zimning status, daraja va barcha badjlarim (progress bilan) */
  @Get('trust/me')
  me(@CurrentUser() user: { id: string }) {
    return this.trust.full(user.id);
  }

  /** Boshqa foydalanuvchining ommaviy ishonch kartochkasi (badj ro'yxatisiz) */
  @Get('trust/user/:id')
  @Roles(Role.FARMER, Role.MARKET, Role.DRIVER, Role.DISPATCHER, Role.ADMIN)
  user(@Param('id', ParseUUIDPipe) id: string) {
    return this.trust.summary(id);
  }

  @Post('ratings')
  @ThrottleProfile('review')
  @Roles(Role.FARMER, Role.MARKET, Role.DRIVER)
  rate(@CurrentUser() user: { id: string }, @Body() dto: CreateRatingDto) {
    return this.ratings.create(user.id, dto);
  }

  @Get('ratings/mine')
  @Roles(Role.FARMER, Role.MARKET, Role.DRIVER)
  mine(@CurrentUser() user: { id: string }) {
    return this.ratings.mine(user.id);
  }
}
