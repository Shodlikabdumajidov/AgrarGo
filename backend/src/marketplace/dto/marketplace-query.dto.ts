import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

// Bo'sh qiymatlar ("?region=") filtr sifatida e'tiborga olinmaydi
const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value;

// Bo'sh qiymat -> undefined (Number('') = 0 bo'lib, filtrni buzmasligi uchun); qolgani songa aylantiriladi
const toNumber = ({ value }: { value: unknown }) => (typeof value === 'string' ? (value.trim() === '' ? undefined : Number(value)) : value);

export const MARKETPLACE_SORTS = ['newest', 'price_asc', 'price_desc'] as const;
export type MarketplaceSort = (typeof MARKETPLACE_SORTS)[number];

export class MarketplaceQuery {
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(50)
  category?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(50)
  region?: string;

  // Narx (so'm/kg) va mavjud miqdor (kg) oralig'i
  @IsOptional() @Transform(toNumber) @IsNumber() @Min(0) @Max(1e12)
  minPrice?: number;

  @IsOptional() @Transform(toNumber) @IsNumber() @Min(0) @Max(1e12)
  maxPrice?: number;

  @IsOptional() @Transform(toNumber) @IsNumber() @Min(0) @Max(1e12)
  minQty?: number;

  @IsOptional() @Transform(toNumber) @IsNumber() @Min(0) @Max(1e12)
  maxQty?: number;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsIn(MARKETPLACE_SORTS)
  sort?: MarketplaceSort;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 12;
}
