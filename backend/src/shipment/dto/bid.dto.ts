import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, MinLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class PlaceBidDto {
  /** Haydovchi taklif qilayotgan yo'l haqi, so'm */
  @Type(() => Number) @IsInt() @Min(1000) @Max(1_000_000_000)
  price!: number;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(300)
  note?: string;
}

export class AcceptBidDto {
  @IsOptional() @IsBoolean()
  acknowledgeRisk?: boolean;
}

export class OpenDisputeDto {
  @Transform(trim) @IsString() @MinLength(5, { message: 'Sababni yozing (kamida 5 ta belgi)' }) @MaxLength(500)
  reason!: string;
}
