import { Body, Controller, Delete, Get, Header, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { ThrottleProfile } from '../security/throttle-profile';
import { CreateReviewDto, ListReviewsQuery } from './dto/review.dto';
import { ReviewsService } from './reviews.service';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  // Ochiq (tokensiz) jonli lenta. Brauzer/proksi keshi yangilanishni kechiktirmasligi uchun qisqa muddat
  @Get()
  @ThrottleProfile('reviewRead')
  @Header('Cache-Control', 'public, max-age=5')
  list(@Query() q: ListReviewsQuery) {
    return this.reviews.list(q);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  mine(@CurrentUser() user: { id: string }) {
    return this.reviews.mine(user.id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ThrottleProfile('review')
  create(@CurrentUser() user: { id: string; role: Role }, @Body() dto: CreateReviewDto) {
    return this.reviews.upsert(user, dto);
  }

  @Delete('mine')
  @UseGuards(JwtAuthGuard)
  remove(@CurrentUser() user: { id: string }) {
    return this.reviews.removeMine(user.id);
  }
}
