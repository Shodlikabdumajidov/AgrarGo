import { Body, Controller, Get, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { memoryStorage } from 'multer';
import { StaffAuditInterceptor } from '../admin/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ThrottleProfile } from '../security/throttle-profile';
import { CreateMarketPriceDto, ListMarketPricesQuery } from './dto/market-price.dto';
import { MAX_PRICE_IMAGE_BYTES, MarketPriceService } from './market-price.service';

/** Bozor narxlari: ko'rish — tizimga kirgan har bir foydalanuvchi; narx kiritish — faqat administrator va dispetcher. */
@Controller('market-prices')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(StaffAuditInterceptor)
export class MarketPriceController {
  constructor(private readonly prices: MarketPriceService) {}

  @Get()
  list(@Query() query: ListMarketPricesQuery) {
    return this.prices.list(query);
  }

  @Get('markets')
  markets() {
    return this.prices.markets();
  }

  @Post()
  @ThrottleProfile('upload')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @UseInterceptors(FileInterceptor('image', { storage: memoryStorage(), limits: { fileSize: MAX_PRICE_IMAGE_BYTES, files: 1 } }))
  create(@Body() dto: CreateMarketPriceDto, @UploadedFile() file?: Express.Multer.File) {
    return this.prices.create(dto, file);
  }
}
