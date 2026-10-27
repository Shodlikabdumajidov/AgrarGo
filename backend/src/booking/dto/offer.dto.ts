import { IsBoolean, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Max, MaxLength } from 'class-validator';

export class CreateOfferDto {
  @IsUUID(undefined, { message: "E'lon identifikatori noto'g'ri" })
  productId: string;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Miqdor raqam bo'lishi kerak (kg)" })
  @IsPositive({ message: "Miqdor 0 dan katta bo'lishi kerak" })
  @Max(9_999_999_999)
  quantityKg: number;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Narx raqam bo'lishi kerak (so'm/kg)" })
  @IsPositive({ message: "Narx 0 dan katta bo'lishi kerak" })
  @Max(9_999_999_999)
  pricePerKg: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  /** Fermer 2+ qizil yulduzga ega bo'lsa, DQQ ogohlantirishi tasdiqlangani */
  @IsOptional()
  @IsBoolean()
  acknowledgeRisk?: boolean;
}

export class CounterOfferDto {
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Narx raqam bo'lishi kerak (so'm/kg)" })
  @IsPositive({ message: "Narx 0 dan katta bo'lishi kerak" })
  @Max(9_999_999_999)
  pricePerKg: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Miqdor raqam bo'lishi kerak (kg)" })
  @IsPositive({ message: "Miqdor 0 dan katta bo'lishi kerak" })
  @Max(9_999_999_999)
  quantityKg?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
