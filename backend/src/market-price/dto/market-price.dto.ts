import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { MARKET_NAMES } from '../market-names';

const clean = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value);

export class CreateMarketPriceDto {
  @IsIn(MARKET_NAMES, { message: "Bozor nomi ro'yxatdan tanlanishi kerak" })
  marketName!: string;

  @Transform(clean)
  @IsString()
  @Length(2, 80, { message: "Mahsulot nomi 2-80 belgi bo'lishi kerak" })
  productName!: string;

  @Type(() => Number)
  @IsInt({ message: "Bugungi narx butun son (so'm) bo'lishi kerak" })
  @Min(1, { message: "Narx 0 dan katta bo'lishi kerak" })
  @Max(1_000_000_000)
  priceToday!: number;
}

export class ListMarketPricesQuery {
  @IsOptional()
  @Transform(clean)
  @IsString()
  @Length(0, 80)
  q?: string;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  market?: string;
}
