import { Body, Controller, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ThrottleProfile } from '../security/throttle-profile';
import { SubscriptionGuard } from '../subscription/subscription.guard';
import { CounterOfferDto, CreateOfferDto } from './dto/offer.dto';
import { OfferService } from './offer.service';

/** Savdolashish (Make an Offer): market narx taklif qiladi; fermer tasdiqlaydi, rad etadi yoki qarshi taklif yuboradi */
@Controller('offers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OfferController {
  constructor(private readonly offers: OfferService) {}

  // --- Market ---
  @Post()
  @ThrottleProfile('booking')
  @UseGuards(SubscriptionGuard)
  @Roles(Role.MARKET)
  create(@CurrentUser() user: any, @Body() dto: CreateOfferDto) {
    return this.offers.create(this.marketId(user), dto);
  }

  @Get('mine')
  @Roles(Role.MARKET)
  mine(@CurrentUser() user: any) {
    return this.offers.listForMarket(this.marketId(user));
  }

  @Post(':id/accept-counter')
  @HttpCode(200)
  @Roles(Role.MARKET)
  acceptCounter(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.offers.marketAcceptCounter(this.marketId(user), id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles(Role.MARKET)
  cancel(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.offers.marketCancel(this.marketId(user), id);
  }

  // --- Fermer ---
  @Get('incoming')
  @Roles(Role.FARMER)
  incoming(@CurrentUser() user: any) {
    return this.offers.listForFarmer(this.farmerId(user));
  }

  @Post(':id/accept')
  @HttpCode(200)
  @Roles(Role.FARMER)
  accept(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.offers.farmerAccept(this.farmerId(user), id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @Roles(Role.FARMER)
  reject(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.offers.farmerReject(this.farmerId(user), id);
  }

  @Post(':id/counter')
  @HttpCode(200)
  @Roles(Role.FARMER)
  counter(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CounterOfferDto) {
    return this.offers.farmerCounter(this.farmerId(user), id, dto);
  }

  private marketId(user: { market?: { id: string } | null }) {
    if (!user.market) throw new ForbiddenException('Market profili topilmadi');
    return user.market.id;
  }

  private farmerId(user: { farmer?: { id: string } | null }) {
    if (!user.farmer) throw new ForbiddenException('Fermer profili topilmadi');
    return user.farmer.id;
  }
}
