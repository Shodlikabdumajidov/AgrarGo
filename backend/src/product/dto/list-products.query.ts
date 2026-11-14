import { ProductStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListProductsQuery {
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}
