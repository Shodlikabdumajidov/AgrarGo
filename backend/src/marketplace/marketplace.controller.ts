import { Controller, Get, Query } from '@nestjs/common';
import { MarketplaceQuery } from './dto/marketplace-query.dto';
import { MarketplaceService } from './marketplace.service';

// Ochiq (tokensiz) bozor: guard yo'q
@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Get()
  list(@Query() query: MarketplaceQuery) {
    return this.marketplace.list(query);
  }
}
