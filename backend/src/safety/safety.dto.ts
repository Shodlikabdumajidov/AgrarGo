import { EBolStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) => (typeof value === 'string' && value.trim() === '' ? undefined : value);

export class EBolListQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;

  @IsOptional() @Transform(emptyToUndefined) @IsIn(['SHIPMENT', 'LOCAL'])
  kind?: 'SHIPMENT' | 'LOCAL';

  @IsOptional() @Transform(emptyToUndefined) @IsEnum(EBolStatus)
  status?: EBolStatus;
}
