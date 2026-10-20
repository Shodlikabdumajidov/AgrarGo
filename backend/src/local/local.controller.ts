import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ThrottleProfile } from '../security/throttle-profile';
import { SubscriptionGuard } from '../subscription/subscription.guard';
import { CancelOrderDto, CourierModeDto, CreateLocalOrderDto, DeliverDto, ListLocalOrdersQuery, LocalMarketQuery, QuoteQuery } from './dto/local.dto';
import { LocalOrderService } from './local-order.service';

const STAFF = [Role.DISPATCHER, Role.ADMIN] as const;

/** Mahalliy bozor: ochiq katalog va narx hisobi (tokensiz, Marketplace kabi) */
@Controller('local')
export class LocalMarketController {
  constructor(private readonly local: LocalOrderService) {}

  @Get('market')
  market(@Query() q: LocalMarketQuery) { return this.local.market(q); }

  @Get('quote')
  quote(@Query() q: QuoteQuery) { return this.local.quote(q.productId, q.quantityKg); }
}

@Controller('local')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LocalOrdersController {
  constructor(private readonly local: LocalOrderService) {}

  // --- Xaridor ---
  @Post('orders') @Roles(Role.CONSUMER) @ThrottleProfile('booking')
  create(@CurrentUser() user: any, @Body() dto: CreateLocalOrderDto) { return this.local.create(user, dto); }

  @Get('orders/mine') @Roles(Role.CONSUMER)
  mine(@CurrentUser() user: any, @Query() q: ListLocalOrdersQuery) { return this.local.mine(user, q); }

  @Post('orders/:id/confirm') @Roles(Role.CONSUMER)
  confirm(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) { return this.local.consumerConfirm(user, id); }

  // --- Fermer ---
  @Get('farmer/orders') @Roles(Role.FARMER)
  farmer(@CurrentUser() user: any, @Query() q: ListLocalOrdersQuery) { return this.local.farmerSales(user, q); }

  // --- Hub xodimi ---
  @Get('hub/orders') @Roles(...STAFF)
  hub(@CurrentUser() user: any, @Query() q: ListLocalOrdersQuery) { return this.local.hubOrders(user, q); }

  @Post('orders/:id/pack-start') @Roles(...STAFF)
  packStart(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) { return this.local.startPacking(user, id); }

  @Post('orders/:id/packed') @Roles(...STAFF)
  packed(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) { return this.local.markPacked(user, id); }

  // --- Bekor qilish: xaridor (faqat PENDING), Hub, administrator ---
  @Post('orders/:id/cancel') @Roles(Role.CONSUMER, ...STAFF)
  cancel(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelOrderDto) { return this.local.cancel(user, id, dto); }

  // --- Shahar ichi kuryeri (haydovchi) ---
  @Get('courier/me') @Roles(Role.DRIVER)
  courierMe(@CurrentUser() user: any) { return this.local.courierMe(user.id); }

  @Patch('courier/mode') @Roles(Role.DRIVER)
  courierMode(@CurrentUser() user: any, @Body() dto: CourierModeDto) { return this.local.setCourierMode(user, dto); }

  @Get('courier/available') @Roles(Role.DRIVER)
  courierAvailable(@CurrentUser() user: any) { return this.local.courierAvailable(user); }

  @Get('courier/mine') @Roles(Role.DRIVER)
  courierMine(@CurrentUser() user: any, @Query() q: ListLocalOrdersQuery) { return this.local.courierMine(user, q); }

  @Post('orders/:id/accept') @Roles(Role.DRIVER) @UseGuards(SubscriptionGuard)
  accept(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) { return this.local.courierAccept(user, id); }

  @Post('orders/:id/deliver') @Roles(Role.DRIVER) @ThrottleProfile('verify')
  deliver(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DeliverDto) { return this.local.courierDeliver(user, id, dto.code); }

  /** Bitta buyurtma (rolga mos ko'rinishda) */
  @Get('orders/:id') @Roles(Role.CONSUMER, Role.FARMER, Role.DRIVER, ...STAFF)
  one(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) { return this.local.get(user, id); }
}
