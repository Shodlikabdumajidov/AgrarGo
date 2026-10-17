import { IsNumber, IsOptional, IsPositive, IsString, IsUUID, Max, MaxLength } from 'class-validator';

export class CreateBookingDto {
  @IsUUID(undefined, { message: "E'lon identifikatori noto'g'ri" })
  productId: string;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Miqdor raqam bo'lishi kerak (kg)" })
  @IsPositive({ message: "Miqdor 0 dan katta bo'lishi kerak" })
  @Max(9_999_999_999)
  quantityKg: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
