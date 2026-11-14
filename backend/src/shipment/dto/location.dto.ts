import { LocationSource } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsISO8601, IsNumber, IsOptional, Max, Min } from 'class-validator';

const FINITE = { allowNaN: false, allowInfinity: false };

export class SendLocationDto {
  @IsNumber(FINITE, { message: "lat son bo'lishi kerak" })
  @Min(-90) @Max(90)
  lat!: number;

  @IsNumber(FINITE, { message: "lng son bo'lishi kerak" })
  @Min(-180) @Max(180)
  lng!: number;

  // Nuqta olingan vaqt (ISO 8601). Berilmasa server vaqti olinadi.
  @IsOptional()
  @IsISO8601({ strict: true }, { message: "timestamp ISO 8601 formatida bo'lishi kerak" })
  timestamp?: string;

  // Qurilma xabar bergan tezlik, km/soat (ixtiyoriy, faqat ma'lumot uchun)
  @IsOptional()
  @IsNumber(FINITE)
  @Min(0) @Max(300)
  speedKmh?: number;

  // GPS aniqligi, metr (ixtiyoriy)
  @IsOptional()
  @IsNumber(FINITE)
  @Min(0) @Max(1_000_000)
  accuracyM?: number;

  @IsOptional()
  @IsEnum(LocationSource)
  source?: LocationSource;
}

export class EldQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1) @Max(7)
  days?: number;
}
