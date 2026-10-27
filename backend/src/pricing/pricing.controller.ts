import { BadRequestException, Controller, Get, NotFoundException, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { paymentBreakdown } from './pricing';
import { RatesService } from '../rates/rates.service';
import { PricingService } from './pricing.service';

@Controller('pricing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PricingController {
  constructor(private readonly pricing: PricingService, private readonly prisma: PrismaService, private readonly rates: RatesService) {}

  /** Bron qilishdan oldin taxminiy to'lov tarkibi (haydovchi yo'l haqi formulasi bilan). Faqat market. */
  @Get('estimate')
  @Roles(Role.MARKET)
  async estimate(@CurrentUser() user: { market?: { region: string } | null }, @Query('productId') productId?: string, @Query('quantityKg') qty?: string) {
    const q = Number(qty);
    if (!productId || !(q > 0) || q > 9_999_999_999) throw new BadRequestException("productId va quantityKg (0 dan katta) kerak");
    if (!user.market) throw new BadRequestException('Market profili topilmadi');
    const p = await this.prisma.product.findFirst({ where: { id: productId, status: 'ACTIVE' }, select: { pricePerKg: true, deliveryPayer: true, farmer: { select: { region: true } } } });
    if (!p) throw new NotFoundException("E'lon topilmadi yoki hozir faol emas");
    const product = p.pricePerKg.mul(q);
    const quote = this.pricing.quote(p.farmer.region, user.market.region, product, q);
    const fee = quote.deliveryFee.toNumber();
    const market = quote.distanceKm > 0 ? await this.rates.compare(p.farmer.region, user.market.region, fee / quote.distanceKm) : null;
    const net = p.deliveryPayer === 'FARMER' ? product.sub(quote.deliveryFee) : product; // yetkazish fermer hisobidan: market jami o'zgarmaydi
    return { ...paymentBreakdown({ ...quote, productPrice: net, deliveryPayer: p.deliveryPayer }), formula: this.pricing.formula(quote.distanceKm, q, quote.deliveryFee), marketRate: market, estimated: true };
  }
}
