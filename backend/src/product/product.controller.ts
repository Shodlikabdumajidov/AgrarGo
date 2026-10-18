import {
  Body, Controller, Delete, ForbiddenException, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { SubscriptionGuard } from '../subscription/subscription.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQuery } from './dto/list-products.query';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductService } from './product.service';

// Tartib muhim: avval JWT (kim ekanini aniqlaydi), keyin rol tekshiruvi
@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.FARMER)
export class ProductController {
  constructor(private readonly products: ProductService) {}

  @Post()
  @UseGuards(SubscriptionGuard)
  create(@CurrentUser() user: any, @Body() dto: CreateProductDto) {
    return this.products.create(this.farmerId(user), dto);
  }

  @Get()
  findMine(@CurrentUser() user: any, @Query() query: ListProductsQuery) {
    return this.products.findAllByFarmer(this.farmerId(user), query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.products.findOneByFarmer(this.farmerId(user), id);
  }

  @Put(':id')
  update(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(this.farmerId(user), id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.products.remove(this.farmerId(user), id);
  }

  private farmerId(user: { farmer?: { id: string } | null }): string {
    if (!user.farmer) throw new ForbiddenException('Fermer profili topilmadi');
    return user.farmer.id;
  }
}
