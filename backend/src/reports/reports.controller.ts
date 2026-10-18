import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ThrottleProfile } from '../security/throttle-profile';
import { ReportsService } from './reports.service';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  private send(res: Response, buf: Buffer, name: string) {
    res.set({ 'Content-Type': XLSX_MIME, 'Content-Disposition': `attachment; filename="${name}"`, 'Content-Length': String(buf.length), 'Cache-Control': 'no-store' });
    res.end(buf);
  }

  @Get('market.xlsx')
  @ThrottleProfile('upload')
  @Roles(Role.MARKET)
  async market(@CurrentUser() user: any, @Query('month') month: string | undefined, @Res() res: Response) {
    this.send(res, await this.reports.market(user, month), `AgrarGo-market-${month || new Date().toISOString().slice(0, 7)}.xlsx`);
  }

  @Get('admin.xlsx')
  @ThrottleProfile('upload')
  @Roles(Role.ADMIN)
  async admin(@Query('from') from: string | undefined, @Query('to') to: string | undefined, @Res() res: Response) {
    this.send(res, await this.reports.admin(from, to), `AgrarGo-admin-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
}
