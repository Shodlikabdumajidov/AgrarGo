import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminRole, Role } from '@prisma/client';
import { AdminRoles } from '../common/admin-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ThrottleProfile } from '../security/throttle-profile';
import { AdjustStockDto, AnnounceIntakeDto, AssignStaffDto, CreateHubDto, ListIntakesQuery, ReceiveIntakeDto, RejectIntakeDto, SetRetailDto, UpdateHubDto } from './dto/hub.dto';
import { BookDockDto, CancelDockDto, CreateDockDto, DayQuery, DockSettingsDto, UpdateDockDto } from './dto/dock.dto';
import { DockService } from './dock.service';
import { HubService } from './hub.service';

const STAFF = [Role.DISPATCHER, Role.ADMIN] as const;

/** Hub'lar ro'yxati va boshqaruvi (administrator) */
@Controller('hubs')
@AdminRoles(AdminRole.HUB_ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class HubsController {
  constructor(private readonly hubs: HubService, private readonly docks: DockService) {}

  @Get()
  list(@CurrentUser() user: any) { return this.hubs.list(user); }

  @Post() @Roles(Role.ADMIN)
  create(@Body() dto: CreateHubDto) { return this.hubs.create(dto); }

  @Patch(':id') @Roles(Role.ADMIN)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateHubDto) { return this.hubs.update(id, dto); }

  @Post(':id/staff') @Roles(Role.ADMIN)
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignStaffDto) { return this.hubs.assignStaff(id, dto.userId); }

  @Delete(':id/staff/:userId') @Roles(Role.ADMIN)
  unassign(@Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string) { return this.hubs.unassignStaff(id, userId); }

  // --- Rampalar (darvozalar): administrator va shu Hub xodimi ---
  @Get(':id/docks') @Roles(Role.FARMER, Role.DRIVER, ...STAFF)
  docksOverview(@Param('id', ParseUUIDPipe) id: string) { return this.docks.overview(id); }

  @Post(':id/docks') @Roles(...STAFF)
  addDock(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateDockDto) { return this.docks.addDock(user, id, dto); }

  @Patch(':id/docks/:dockId') @Roles(...STAFF)
  updateDock(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Param('dockId', ParseUUIDPipe) dockId: string, @Body() dto: UpdateDockDto) { return this.docks.updateDock(user, id, dockId, dto); }

  @Delete(':id/docks/:dockId') @Roles(...STAFF)
  removeDock(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Param('dockId', ParseUUIDPipe) dockId: string) { return this.docks.removeDock(user, id, dockId); }

  @Patch(':id/dock-settings') @Roles(...STAFF)
  dockSettings(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DockSettingsDto) { return this.docks.updateSettings(user, id, dto); }

  /** Band qilish uchun bo'sh/band slotlar (fermer, haydovchi, xodim) */
  @Get(':id/dock-slots') @Roles(Role.FARMER, Role.DRIVER, ...STAFF)
  dockSlots(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Query() q: DayQuery) { return this.docks.slots(user, id, q.date); }

  /** Kunning to'liq jadvali (Gantt): faqat Hub xodimi va administrator */
  @Get(':id/dock-schedule') @Roles(...STAFF)
  dockSchedule(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Query() q: DayQuery) { return this.docks.schedule(user, id, q.date); }
}

/** Fermer: Hub omboriga topshirish va chakana sotuv; Hub xodimi: qabul va qoldiq */
@Controller('hub')
@AdminRoles(AdminRole.HUB_ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class HubOpsController {
  constructor(private readonly hubs: HubService, private readonly docks: DockService) {}

  // --- Rampa yozuvlari ---
  @Post('dock-bookings') @Roles(Role.FARMER, Role.DRIVER) @ThrottleProfile('booking')
  book(@CurrentUser() user: any, @Body() dto: BookDockDto) { return this.docks.book(user, dto); }

  @Get('dock-bookings/mine') @Roles(Role.FARMER, Role.DRIVER)
  myBookings(@CurrentUser() user: any) { return this.docks.mine(user); }

  @Post('dock-bookings/:id/cancel') @Roles(Role.FARMER, Role.DRIVER, ...STAFF)
  cancelBooking(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelDockDto) { return this.docks.cancel(user, id, dto.reason); }

  @Post('dock-bookings/:id/arrive') @Roles(...STAFF)
  arrive(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) { return this.docks.arrive(user, id); }

  @Post('dock-bookings/:id/complete') @Roles(...STAFF)
  complete(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) { return this.docks.complete(user, id); }

  @Post('dock-bookings/:id/no-show') @Roles(...STAFF)
  noShow(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) { return this.docks.noShow(user, id); }

  @Get('retail') @Roles(Role.FARMER)
  overview(@CurrentUser() user: any) { return this.hubs.farmerOverview(user); }

  @Post('intakes') @Roles(Role.FARMER) @ThrottleProfile('booking')
  announce(@CurrentUser() user: any, @Body() dto: AnnounceIntakeDto) { return this.hubs.announce(user, dto); }

  @Post('intakes/:id/cancel') @Roles(Role.FARMER)
  cancel(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) { return this.hubs.cancelIntake(user, id); }

  @Patch('retail/:productId') @Roles(Role.FARMER)
  setRetail(@CurrentUser() user: any, @Param('productId', ParseUUIDPipe) id: string, @Body() dto: SetRetailDto) { return this.hubs.setRetail(user, id, dto); }

  @Get('intakes') @Roles(Role.FARMER, ...STAFF)
  intakes(@CurrentUser() user: any, @Query() q: ListIntakesQuery) { return this.hubs.listIntakes(user, q); }

  @Post('intakes/:id/receive') @Roles(...STAFF)
  receive(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReceiveIntakeDto) { return this.hubs.receive(user, id, dto); }

  @Post('intakes/:id/reject') @Roles(...STAFF)
  reject(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectIntakeDto) { return this.hubs.reject(user, id, dto); }

  @Get('stock') @Roles(...STAFF)
  stock(@CurrentUser() user: any, @Query('hubId') hubId?: string) { return this.hubs.stock(user, hubId); }

  @Post('stock/:id/adjust') @Roles(...STAFF)
  adjust(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AdjustStockDto) { return this.hubs.adjust(user, id, dto); }
}
