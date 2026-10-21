import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { AdminRole, Role } from '@prisma/client';
import { NoStoreInterceptor, StaffAuditInterceptor } from '../admin/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminRoles } from '../common/admin-roles.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ThrottleProfile } from '../security/throttle-profile';
import { AdjustmentsQuery, EscrowListQuery, PeriodQuery, ResolvePaymentDto } from './finance.dto';
import { FinanceService } from './finance.service';

/** Moliya (buxgalteriya) paneli: FINANCE_ADMIN va SUPER_ADMIN. O'zgartiruvchi amallar audit jurnaliga yoziladi. */
@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@AdminRoles(AdminRole.FINANCE_ADMIN)
@UseInterceptors(NoStoreInterceptor, StaffAuditInterceptor)
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('summary') summary(@Query() q: PeriodQuery) { return this.finance.summary(q); }
  @Get('cashback/monthly') cashbackMonthly() { return this.finance.cashbackMonthly(); }
  @Get('escrow') escrow(@Query() q: EscrowListQuery) { return this.finance.escrow(q); }
  @Get('adjustments') adjustments(@Query() q: AdjustmentsQuery) { return this.finance.adjustments(q); }
  @Get('reconcile') reconcile() { return this.finance.reconcile(); }
  @Get('payments/:id') payment(@Param('id', ParseUUIDPipe) id: string) { return this.finance.paymentDetail(id); }

  @Post('payments/:id/resolve') @HttpCode(200) @ThrottleProfile('payment')
  resolve(@CurrentUser() me: { id: string }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolvePaymentDto) { return this.finance.resolve(me, id, dto); }
}
