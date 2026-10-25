import { Body, Controller, ForbiddenException, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { SubscriptionGuard } from '../subscription/subscription.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ThrottleProfile } from '../security/throttle-profile';
import { SignEBolDto } from '../ebol/dto/ebol.dto';
import { ChainAcceptDto } from './dto/chain-accept.dto';
import { EldQuery, SendLocationDto } from './dto/location.dto';
import { LocationService } from './tracking/location.service';
import { AvailableShipmentsFilterQuery, ListShipmentsQuery } from './dto/list-shipments.query';
import { ShipmentService } from './shipment.service';

@Controller('shipments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ShipmentController {
  constructor(private readonly shipments: ShipmentService, private readonly locations: LocationService) {}

  // --- Haydovchi (DRIVER) ---
  @Get('available')
  @Roles(Role.DRIVER)
  available(@CurrentUser() user: any, @Query() query: AvailableShipmentsFilterQuery) {
    return this.shipments.listAvailable(this.driver(user), query);
  }

  /** Har bir ochiq yukka eng yaxshi TriHaul varianti */
  @Get('trihaul')
  @Roles(Role.DRIVER)
  trihaulBatch(@CurrentUser() user: any) {
    return this.shipments.trihaulBatch(this.driver(user));
  }

  /** Zanjirli bron (Chain Booking): ikkita yukni bir bosishda biriktirish */
  @Post('chain-accept')
  @UseGuards(SubscriptionGuard)
  @Roles(Role.DRIVER)
  chainAccept(@CurrentUser() user: any, @Body() dto: ChainAcceptDto) {
    return this.shipments.acceptChain(this.driver(user), dto.firstId, dto.secondId);
  }

  @Get(':id/trihaul')
  @Roles(Role.DRIVER)
  trihaul(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.shipments.trihaul(this.driver(user), id);
  }

  @Post(':id/accept')
  @UseGuards(SubscriptionGuard)
  @Roles(Role.DRIVER)
  accept(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.shipments.accept(this.driver(user), id);
  }

  /** Smart-taklif: LTL e'londagi qolgan joyga sig'adigan shu yo'nalishdagi boshqa yuklar */
  @Get(':id/ltl-suggestions')
  @Roles(Role.DRIVER)
  ltlSuggestions(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.shipments.ltlSuggestions(this.driver(user).id, id);
  }

  @Post(':id/release')
  @Roles(Role.DRIVER)
  release(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.shipments.release(this.driver(user).id, id);
  }

  @Patch(':id/advance')
  @Roles(Role.DRIVER)
  advance(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.shipments.advance(this.driver(user).id, id);
  }

  /** e-BOL: yuklash joyiga yetib keldim — fermer telefoniga kod yuboriladi */
  @Post(':id/arrived')
  @HttpCode(200)
  @Roles(Role.DRIVER)
  @ThrottleProfile('verify')
  arrived(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.shipments.arrived(this.driver(user).id, id);
  }

  /** e-BOL: fermerdan olingan kodni kiritish — imzo + yo'lga chiqish */
  @Post(':id/sign')
  @HttpCode(200)
  @Roles(Role.DRIVER)
  @ThrottleProfile('verify')
  sign(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SignEBolDto) {
    return this.shipments.sign(this.driver(user).id, id, dto.code);
  }

  // --- GPS (live tracking) va ELD ---
  @Get('eld')
  @Roles(Role.DRIVER)
  @Header('Cache-Control', 'no-store')
  eld(@CurrentUser() user: any, @Query() query: EldQuery) {
    return this.locations.eld(this.driver(user).id, query.days ?? 7);
  }

  @Post(':id/location')
  @HttpCode(200)
  @Roles(Role.DRIVER)
  @ThrottleProfile('location')
  sendLocation(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SendLocationDto) {
    return this.locations.record(this.driver(user).id, id, dto);
  }

  @Get(':id/location')
  @Roles(Role.DRIVER, Role.FARMER, Role.MARKET, Role.ADMIN)
  @Header('Cache-Control', 'no-store')
  location(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.locations.current(user, id);
  }

  // --- Haydovchi, fermer va market: o'z yuklari ---
  @Get('mine')
  @Roles(Role.DRIVER, Role.FARMER, Role.MARKET)
  mine(@CurrentUser() user: any, @Query() query: ListShipmentsQuery) {
    return this.shipments.listMine(user, query);
  }

  private driver(user: { driver?: { id: string; capacityKg: any } | null }) {
    if (!user.driver) throw new ForbiddenException('Haydovchi profili topilmadi');
    return user.driver;
  }
}
