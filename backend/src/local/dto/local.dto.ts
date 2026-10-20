import { LocalOrderStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, Min, ValidateNested } from 'class-validator';

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

export class CartItemDto extends QuoteQuery {}

/** Savatni narxlash (to'lovsiz): har bir qator uchun narx va xato bo'lsa sababi */
export class CartQuoteDto {
  @IsArray() @ArrayMinSize(1, { message: "Savat bo'sh" }) @ArrayMaxSize(20, { message: "Savatda ko'pi bilan 20 ta mahsulot bo'lishi mumkin" })
  @ValidateNested({ each: true }) @Type(() => CartItemDto)
  items!: CartItemDto[];
}

/** Savatni bitta umumiy to'lov bilan rasmiylashtirish */
export class BulkCheckoutDto extends CartQuoteDto {
  @IsOptional() @Transform(clean) @IsString() @Length(2, 60) region?: string;

  @Transform(clean) @IsString() @Length(2, 80, { message: 'Tuman yoki mahallani kiriting' })
  district!: string;

  @Transform(clean) @IsString() @Length(5, 200, { message: "Yetkazib berish manzilini to'liq kiriting (5-200 belgi)" })
  address!: string;

  @IsOptional() @Matches(/^\+998\d{9}$/, { message: "Telefon raqam +998XXXXXXXXX formatida bo'lishi kerak" })
  phone?: string;

  @IsOptional() @Transform(clean) @IsString() @Length(0, 300)
  note?: string;

  /** Qayta yuborilgan so'rov ikki marta to'lamasligi uchun (mijoz har bir "To'lash" bosilishiga bitta kalit yaratadi) */
  @IsOptional() @Matches(/^[A-Za-z0-9_-]{8,64}$/, { message: "Idempotentlik kaliti 8-64 belgi (harf, raqam, - va _)" })
  idempotencyKey?: string;
}

export class AcceptOrderDto {
  /** Rampa yozuvi (bo'sh bo'lsa hozirgi vaqtga mos kelgani avtomatik tanlanadi) */
  @IsOptional() @IsUUID('all') appointmentId?: string;
}

export class PackGroupDto {
  /** true — hammasi tayyor (kuryerga); false/bo'sh — hammasini qadoqlashga o'tkazish */
  @IsOptional() @IsBoolean() ready?: boolean;
}
