import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { AdminRole, Role } from '@prisma/client';
import { AdminRoles } from '../common/admin-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ThrottleProfile } from '../security/throttle-profile';
import { ComplaintService } from './complaint.service';
import { CreateComplaintDto, DecideComplaintDto, ListComplaintsQuery } from './dto/complaint.dto';

const PARTIES = [Role.FARMER, Role.DRIVER, Role.MARKET] as const;

/** Shikoyat / spam va qizil yulduzcha (penalty) tizimi */
@Controller('complaints')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ComplaintController {
  constructor(private readonly complaints: ComplaintService) {}

  // --- Fermer, haydovchi, market ---
  /** Zakazlar tarixidagi hamkorlar (shikoyat modalidagi ro'yxat) */
  @Get('partners')
  @Roles(...PARTIES)
  partners(@CurrentUser() user: any) { return this.complaints.partners(user); }

  @Post()
  @ThrottleProfile('booking')
  @Roles(...PARTIES)
  create(@CurrentUser() user: any, @Body() dto: CreateComplaintDto) { return this.complaints.create(user, dto.accusedId, dto.reason); }

  @Get('mine')
  @Roles(...PARTIES)
  mine(@CurrentUser() user: any) { return this.complaints.listMine(user); }

  @Post(':id/withdraw')
  @HttpCode(200)
  @Roles(...PARTIES)
  withdraw(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) { return this.complaints.withdraw(user, id); }

  // --- Dispetcher va Super admin (Safety admin ham) ---
  @Get()
  @Roles(Role.DISPATCHER, Role.ADMIN)
  @AdminRoles(AdminRole.SAFETY_ADMIN)
  all(@Query() q: ListComplaintsQuery) { return this.complaints.listAll(q.status); }

  @Post(':id/decide')
  @HttpCode(200)
  @Roles(Role.DISPATCHER, Role.ADMIN)
  @AdminRoles(AdminRole.SAFETY_ADMIN)
  decide(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideComplaintDto) { return this.complaints.decide(user, id, dto.decision, dto.note); }
}
