import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { MarketPriceController } from './market-price.controller';
import { MarketPriceService } from './market-price.service';

@Module({ imports: [AdminModule], controllers: [MarketPriceController], providers: [MarketPriceService] })
export class MarketPriceModule {}
