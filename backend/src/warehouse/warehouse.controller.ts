import {
  Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { memoryStorage } from 'multer';
import { StaffAuditInterceptor } from '../admin/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { SubscriptionGuard } from '../subscription/subscription.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ThrottleProfile } from '../security/throttle-profile';
import {
  AnnounceItemDto, CountDto, CreateOrderDto, CreateUnitDto, DispatchDto, FeedQuery, InspectDto, ItemsQuery, MoveDto, OrdersQuery,
  ReadingDto, ReceiveDto, SortDto,
} from './dto/warehouse.dto';
import { WarehouseOrderService } from './warehouse-order.service';
import { MAX_ITEM_PHOTO_BYTES, WarehouseService } from './warehouse.service';

const STAFF = [Role.DISPATCHER, Role.ADMIN];
const uuid = new ParseUUIDPipe();

@Controller('warehouse')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(StaffAuditInterceptor)
export class WarehouseController {
  constructor(private readonly items: WarehouseService, private readonly orders: WarehouseOrderService) {}

  // ===== Fermer =====
  @Post('items')
  @UseGuards(SubscriptionGuard)
  @Roles(Role.FARMER)
  @ThrottleProfile('booking')
  announce(@CurrentUser() user: any, @Body() dto: AnnounceItemDto) {
    return this.items.announce(user.farmer.id, dto);
  }

  @Delete('items/:id')
  @Roles(Role.FARMER)
  cancelAnnouncement(@CurrentUser() user: any, @Param('id', uuid) id: string) {
    return this.items.cancelAnnouncement(user.farmer.id, id);
  }

  @Get('items/mine')
  @Roles(Role.FARMER)
  @Header('Cache-Control', 'no-store')
  mine(@CurrentUser() user: any, @Query() q: ItemsQuery) {
    return this.items.listMine(user.farmer.id, q);
  }

  // ===== Market: jo'natishga tayyor postlar =====
  @Get('feed')
  @Roles(Role.MARKET, ...STAFF)
  @Header('Cache-Control', 'no-store')
  feed(@Query() q: FeedQuery) {
    return this.items.feed(q);
  }

  // ===== Dispetcher / Admin =====
  @Get('items')
  @Roles(...STAFF)
  @Header('Cache-Control', 'no-store')
  all(@Query() q: ItemsQuery) {
    return this.items.listAll(q);
  }

  @Get('scan/:code')
  @Roles(...STAFF)
  scan(@Param('code') code: string) {
    return this.items.scan(code);
  }

  @Get('items/:id')
  @Roles(Role.FARMER, Role.MARKET, ...STAFF)
  @Header('Cache-Control', 'no-store')
  one(@CurrentUser() user: any, @Param('id', uuid) id: string) {
    return this.items.getOne(user, id);
  }

  @Post('items/:id/receive')
  @HttpCode(200)
  @Roles(...STAFF)
  receive(@CurrentUser() user: any, @Param('id', uuid) id: string, @Body() dto: ReceiveDto) {
    return this.items.receive(user.id, id, dto);
  }

  @Post('items/:id/inspect')
  @HttpCode(200)
  @Roles(...STAFF)
  inspect(@CurrentUser() user: any, @Param('id', uuid) id: string, @Body() dto: InspectDto) {
    return this.items.inspect(user.id, id, dto);
  }

  @Post('items/:id/move')
  @HttpCode(200)
  @Roles(...STAFF)
  move(@CurrentUser() user: any, @Param('id', uuid) id: string, @Body() dto: MoveDto) {
    return this.items.move(user.id, id, dto);
  }

  @Post('items/:id/sort')
  @HttpCode(200)
  @Roles(...STAFF)
  sort(@CurrentUser() user: any, @Param('id', uuid) id: string, @Body() dto: SortDto) {
    return this.items.sort(user.id, id, dto);
  }

  @Post('items/:id/count')
  @HttpCode(200)
  @Roles(...STAFF)
  count(@CurrentUser() user: any, @Param('id', uuid) id: string, @Body() dto: CountDto) {
    return this.items.count(user.id, id, dto);
  }

  @Post('items/:id/photo')
  @HttpCode(200)
  @Roles(Role.FARMER, ...STAFF)
  @ThrottleProfile('upload')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_ITEM_PHOTO_BYTES, files: 1 } }))
  photo(@CurrentUser() user: any, @Param('id', uuid) id: string, @UploadedFile() file?: Express.Multer.File) {
    return this.items.setPhoto(user, id, file);
  }

  // ===== Kameralar =====
  @Get('units')
  @Roles(...STAFF)
  @Header('Cache-Control', 'no-store')
  units() {
    return this.items.listUnits();
  }

  @Post('units')
  @Roles(...STAFF)
  createUnit(@Body() dto: CreateUnitDto) {
    return this.items.createUnit(dto);
  }

  @Post('units/defaults')
  @Roles(...STAFF)
  defaults() {
    return this.items.createDefaultUnits();
  }

  @Post('units/:id/readings')
  @HttpCode(200)
  @Roles(...STAFF)
  reading(@Param('id', uuid) id: string, @Body() dto: ReadingDto) {
    return this.items.recordReading(id, dto);
  }

  @Get('inventory')
  @Roles(...STAFF)
  @Header('Cache-Control', 'no-store')
  inventory() {
    return this.items.inventory();
  }

  // ===== Buyurtmalar =====
  @Post('orders')
  @Roles(Role.MARKET)
  @ThrottleProfile('booking')
  createOrder(@CurrentUser() user: any, @Body() dto: CreateOrderDto) {
    return this.orders.create(user.market.id, dto);
  }

  @Get('orders/mine')
  @Roles(Role.MARKET, Role.FARMER, Role.DRIVER)
  @Header('Cache-Control', 'no-store')
  myOrders(@CurrentUser() user: any, @Query() q: OrdersQuery) {
    return this.orders.listMine(user, q);
  }

  @Get('orders')
  @Roles(...STAFF)
  @Header('Cache-Control', 'no-store')
  allOrders(@Query() q: OrdersQuery) {
    return this.orders.listAll(q);
  }

  @Get('drivers')
  @Roles(...STAFF)
  drivers() {
    return this.orders.drivers();
  }

  @Patch('orders/:id/picking')
  @Roles(...STAFF)
  picking(@Param('id', uuid) id: string) {
    return this.orders.startPicking(id);
  }

  @Patch('orders/:id/picked')
  @Roles(...STAFF)
  picked(@Param('id', uuid) id: string) {
    return this.orders.picked(id);
  }

  @Patch('orders/:id/assign')
  @Roles(...STAFF)
  assign(@Param('id', uuid) id: string, @Body() dto: DispatchDto) {
    return this.orders.assign(id, dto);
  }

  @Patch('orders/:id/dispatch')
  @Roles(...STAFF)
  dispatch(@CurrentUser() user: any, @Param('id', uuid) id: string) {
    return this.orders.dispatch(user.id, id);
  }

  @Patch('orders/:id/cancel')
  @Roles(Role.MARKET, ...STAFF)
  cancel(@CurrentUser() user: any, @Param('id', uuid) id: string) {
    return this.orders.cancel(user, id);
  }

  @Patch('orders/:id/deliver')
  @Roles(Role.MARKET, ...STAFF)
  deliver(@CurrentUser() user: any, @Param('id', uuid) id: string) {
    return this.orders.deliver(user, id);
  }
}
