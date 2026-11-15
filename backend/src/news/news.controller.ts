import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { Role } from '@prisma/client';
import { StaffAuditInterceptor } from '../admin/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { CreateNewsDto, ListNewsQuery, UpdateNewsDto } from './dto/news.dto';
import { NewsIngestorService } from './news-ingestor.service';
import { NewsService } from './news.service';

/**
 * Agro-logistika yangiliklari. `GET /news` (va `GET /api/news`) — ochiq:
 *  • mehmon: faqat umumiy yangilik, ai_insight_* maydonlari javobda YO'Q;
 *  • JWT bilan: roliga mos `aiInsight` ham qaytadi (Admin/Dispetcher — uchala rol).
 * Yaratish/tahrirlash/o'chirish — faqat Admin va Dispetcher; yaratilganda AI xulosalar avtomatik hosil qilinadi.
 */
@Controller(['news', 'api/news'])
export class NewsController {
  constructor(private readonly news: NewsService, private readonly ingestor: NewsIngestorService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @Header('Cache-Control', 'no-store')
  @Header('Vary', 'Authorization')
  list(@CurrentUser() user: any, @Query() q: ListNewsQuery) { return this.news.list(user, q); }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @UseInterceptors(StaffAuditInterceptor)
  @Roles(Role.ADMIN, Role.DISPATCHER)
  create(@CurrentUser() user: any, @Body() dto: CreateNewsDto) { return this.news.create(dto, user); }

  /** «Yangiliklarni hozir yangilash»: RSS tasmalarini darhol o'qiydi (kalit so'z filtri + AI tahlil), natija statistikasini qaytaradi */
  @Post('refresh')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @UseInterceptors(StaffAuditInterceptor)
  @Roles(Role.ADMIN, Role.DISPATCHER)
  refresh() { return this.ingestor.run(); }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @UseInterceptors(StaffAuditInterceptor)
  @Roles(Role.ADMIN, Role.DISPATCHER)
  update(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateNewsDto) { return this.news.update(id, dto, user); }

  @Delete(':id')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @UseInterceptors(StaffAuditInterceptor)
  @Roles(Role.ADMIN, Role.DISPATCHER)
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.news.remove(id); }
}
