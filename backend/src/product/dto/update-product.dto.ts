import { PartialType } from '@nestjs/mapped-types';
import { ProductStatus } from '@prisma/client';
import { IsIn, IsOptional } from 'class-validator';
import { CreateProductDto } from './create-product.dto';

export class UpdateProductDto extends PartialType(CreateProductDto) {
  // BOOKED/SOLD keyinchalik bron va to'lov oqimi orqali o'zgaradi; fermer faqat shularni tanlay oladi
  @IsOptional()
  @IsIn([ProductStatus.ACTIVE, ProductStatus.ARCHIVED], {
    message: "Holat faqat ACTIVE yoki ARCHIVED bo'lishi mumkin",
  })
  status?: ProductStatus;
}
