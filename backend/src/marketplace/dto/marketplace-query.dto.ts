import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

// Bo'sh qiymatlar ("?region=") filtr sifatida e'tiborga olinmaydi
const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value;

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
