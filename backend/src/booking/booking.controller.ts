import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ThrottleProfile } from '../security/throttle-profile';
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ListBookingsQuery } from './dto/list-bookings.query';

@Controller('bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BookingController {
  constructor(private readonly bookings: BookingService) {}

  // --- Supermarket (MARKET) ---
  @Post()
  @ThrottleProfile('booking')
  @Roles(Role.MARKET)
  create(@CurrentUser() user: any, @Body() dto: CreateBookingDto) {
    return this.bookings.create(this.marketId(user), dto);
  }

  @Get('mine')
  @Roles(Role.MARKET)
  mine(@CurrentUser() user: any, @Query() query: ListBookingsQuery) {
    return this.bookings.listForMarket(this.marketId(user), query);
  }

  @Patch(':id/cancel')
  @Roles(Role.MARKET)
  cancel(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.cancel(this.marketId(user), id);
  }

  // --- Fermer (FARMER) ---
  @Get('incoming')
  @Roles(Role.FARMER)
  incoming(@CurrentUser() user: any, @Query() query: ListBookingsQuery) {
    return this.bookings.listForFarmer(this.farmerId(user), query);
  }

  @Patch(':id/approve')
  @Roles(Role.FARMER)
  approve(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.approve(this.farmerId(user), id);
  }

  @Patch(':id/reject')
  @Roles(Role.FARMER)
  reject(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookings.reject(this.farmerId(user), id);
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
