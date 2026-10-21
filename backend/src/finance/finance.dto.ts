import { PaymentStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) => (typeof value === 'string' && value.trim() === '' ? undefined : value);
const clean = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value);

export class PeriodQuery {
  @IsOptional() @Transform(emptyToUndefined) @IsDateString() from?: string;
  @IsOptional() @Transform(emptyToUndefined) @IsDateString() to?: string;
}

export class EscrowListQuery extends PeriodQuery {
  @IsOptional() @Transform(emptyToUndefined) @IsEnum(PaymentStatus) status?: PaymentStatus;
  @IsOptional() @Transform(emptyToUndefined) @IsIn(['BOOKING', 'WAREHOUSE', 'LOCAL']) kind?: 'BOOKING' | 'WAREHOUSE' | 'LOCAL';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class AdjustmentsQuery extends PeriodQuery {
  @IsOptional() @Transform(emptyToUndefined) @IsIn(['DAMAGE', 'PACKAGING', 'DISPUTE']) kind?: 'DAMAGE' | 'PACKAGING' | 'DISPUTE';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

/**
 * Nizoni qo'lda hal qilish:
 *  DAMAGE  — ziyon: jami qutilardan yaroqsizlari (xaridorga nisbatan qaytariladi, fermer ulushi kamayadi)
 *  PERCENT — mahsulot summasining foizi qaytariladi (qutilarsiz nizo)
 *  RELEASE — escrow'ni fermerga chiqarish; REFUND — to'liq qaytarish (faqat bron to'lovlari)
 */
export class ResolvePaymentDto {
  @IsIn(['DAMAGE', 'PERCENT', 'RELEASE', 'REFUND']) action!: 'DAMAGE' | 'PERCENT' | 'RELEASE' | 'REFUND';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) damagedBoxes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(2) @Max(100000) totalBoxes?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(99) percent?: number;
  @IsOptional() @IsIn(['KEEP', 'PRORATE']) deliveryPolicy?: 'KEEP' | 'PRORATE';
  @Transform(clean) @IsString() @Length(3, 300, { message: 'Qaror sababini yozing (3-300 belgi)' }) reason!: string;
}
