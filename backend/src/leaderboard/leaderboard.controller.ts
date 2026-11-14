import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { LeaderboardService } from './leaderboard.service';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly board: LeaderboardService) {}

  /** Bosh sahifa: oylik reyting TOP-3 (haydovchilar — km, fermerlar — sotilgan tonna, marketlar — xarid tonna va zakazlar). Ochiq. */
  @Get()
  @Header('Cache-Control', 'public, max-age=30')
  top() { return this.board.top(); }

  /** «Reytingim»: o'z oylik ko'rsatkichi va o'rni */
  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.FARMER, Role.DRIVER, Role.MARKET)
  @Header('Cache-Control', 'no-store')
  me(@CurrentUser() user: any) { return this.board.me(user); }
}
