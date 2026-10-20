import { LocalOrderStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';

const clean = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value);

export class LocalMarketQuery {
  @IsOptional() @Transform(clean) @IsString() @Length(0, 60) region?: string;
  @IsOptional() @IsUUID('all') hubId?: string;
  @IsOptional() @Transform(clean) @IsString() @Length(0, 80) q?: string;
}

export class QuoteQuery {
  @IsUUID('all', { message: "Mahsulot identifikatori noto'g'ri" }) productId!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }, { message: "Miqdor kg da bo'lsin" }) @Min(0.01) @Max(100_000) quantityKg!: number;
}

export class CreateLocalOrderDto extends QuoteQuery {
  @IsOptional() @Transform(clean) @IsString() @Length(2, 60) region?: string;

  @Transform(clean) @IsString() @Length(2, 80, { message: 'Tuman yoki mahallani kiriting' })
  district!: string;

  @Transform(clean) @IsString() @Length(5, 200, { message: "Yetkazib berish manzilini to'liq kiriting (5-200 belgi)" })
  address!: string;

  @IsOptional() @Matches(/^\+998\d{9}$/, { message: "Telefon raqam +998XXXXXXXXX formatida bo'lishi kerak" })
  phone?: string;

  @IsOptional() @Transform(clean) @IsString() @Length(0, 300)
  note?: string;
}

export class CancelOrderDto {
  @IsOptional() @Transform(clean) @IsString() @Length(0, 300) reason?: string;
}

export class DeliverDto {
  @Matches(/^\d{4}$/, { message: "Topshirish kodi 4 ta raqamdan iborat" }) code!: string;
}

export class CourierModeDto {
  @IsBoolean() enabled!: boolean;
  @IsOptional() @IsUUID('all') hubId?: string;
}

export class ListLocalOrdersQuery {
  @IsOptional() @IsEnum(LocalOrderStatus) status?: LocalOrderStatus;
  @IsOptional() @IsUUID('all') hubId?: string;
}
