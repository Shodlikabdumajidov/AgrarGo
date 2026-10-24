import { RadiusQuery } from '../../common/geo-search';
import { ShipmentStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

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
