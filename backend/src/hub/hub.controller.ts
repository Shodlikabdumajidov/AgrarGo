import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ThrottleProfile } from '../security/throttle-profile';
import { AdjustStockDto, AnnounceIntakeDto, AssignStaffDto, CreateHubDto, ListIntakesQuery, ReceiveIntakeDto, RejectIntakeDto, SetRetailDto, UpdateHubDto } from './dto/hub.dto';
import { HubService } from './hub.service';

const STAFF = [Role.DISPATCHER, Role.ADMIN] as const;

/** Hub'lar ro'yxati va boshqaruvi (administrator) */
@Controller('hubs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HubsController {
  constructor(private readonly hubs: HubService) {}

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
}

/** Fermer: Hub omboriga topshirish va chakana sotuv; Hub xodimi: qabul va qoldiq */
@Controller('hub')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HubOpsController {
  constructor(private readonly hubs: HubService) {}

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
