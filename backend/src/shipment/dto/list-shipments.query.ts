import { RadiusQuery } from '../../common/geo-search';
import { ShipmentStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const emptyNumber = ({ value }: { value: unknown }) => (value === undefined || (typeof value === 'string' && value.trim() === '') ? undefined : Number(value));
const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export class ListShipmentsQuery {
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsEnum(ShipmentStatus)
  status?: ShipmentStatus;
}

export class AvailableShipmentsQuery extends RadiusQuery {
  // Qayerdan olib ketilishi bo'yicha viloyat filtri
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(50)
  originRegion?: string;
}

/** Haydovchi uchun yuklar filtri: yo'nalish (qayerdan -> qayerga), yuk turi va tonnaj (kg) */
export class AvailableShipmentsFilterQuery extends AvailableShipmentsQuery {
  @IsOptional() @Transform(emptyToUndefined) @IsString() @MaxLength(50)
  destRegion?: string;

  @IsOptional() @Transform(emptyToUndefined) @IsString() @MaxLength(60)
  category?: string;

  @IsOptional() @Transform(emptyNumber) @IsNumber() @Min(0) @Max(1_000_000)
  minKg?: number;

  @IsOptional() @Transform(emptyNumber) @IsNumber() @Min(0) @Max(1_000_000)
  maxKg?: number;
}
