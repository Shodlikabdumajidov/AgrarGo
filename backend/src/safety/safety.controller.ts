import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { AdminRole, Role } from '@prisma/client';
import { NoStoreInterceptor } from '../admin/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminRoles } from '../common/admin-roles.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { EBolListQuery } from './safety.dto';
import { SafetyService } from './safety.service';

/** Safety Admin paneli (SAFETY_ADMIN; SUPER_ADMIN ham kira oladi). Kutayotgan foydalanuvchilar: GET /kyc/pending, POST /kyc/:id/approve|reject. */
@Controller('safety')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@AdminRoles(AdminRole.SAFETY_ADMIN)
@UseInterceptors(NoStoreInterceptor)
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}

  @Get('summary')
  summary() { return this.safety.summary(); }

  @Get('ebol')
  list(@Query() q: EBolListQuery) { return this.safety.listEbol(q); }

  @Get('ebol/:id')
  one(@Param('id', ParseUUIDPipe) id: string) { return this.safety.getEbol(id); }
}
