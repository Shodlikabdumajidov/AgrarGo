import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { CashbackService } from './cashback.service';

class CashbackQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

/** Mening keshbeklarim: har qanday kirgan foydalanuvchi faqat o'zinikini ko'radi */
@Controller('cashback')
@UseGuards(JwtAuthGuard)
export class CashbackController {
  constructor(private readonly cashback: CashbackService) {}

  @Get()
  mine(@CurrentUser() user: { id: string }, @Query() q: CashbackQuery) { return this.cashback.summary(user.id, q.page, q.limit); }
}
