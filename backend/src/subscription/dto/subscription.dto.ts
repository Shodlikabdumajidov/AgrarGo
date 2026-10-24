import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional } from 'class-validator';
import { ALLOWED_MONTHS } from '../subscription.logic';

export class PaySubscriptionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn(ALLOWED_MONTHS as unknown as number[], { message: 'months 1, 3, 6 yoki 12 bo\'lishi kerak' })
  months: number = 1;
}
