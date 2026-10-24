import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength, MinLength } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MinLength(2, { message: "Mahsulot nomi kamida 2 ta belgidan iborat bo'lishi kerak" })
  @MaxLength(100)
  name: string;

  @IsString()
  @MinLength(2, { message: 'Kategoriyani kiriting' })
  @MaxLength(50)
  category: string;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Vazn raqam bo'lishi kerak (kg)" })
  @IsPositive({ message: "Vazn 0 dan katta bo'lishi kerak" })
  @Max(9_999_999_999)
  quantityKg: number;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Narx raqam bo'lishi kerak (so'm)" })
  @IsPositive({ message: "Narx 0 dan katta bo'lishi kerak" })
  @Max(9_999_999_999)
  pricePerKg: number;

  @IsOptional()
  @IsDateString({}, { message: "O'rim-yig'im sanasi YYYY-MM-DD formatida bo'lishi kerak" })
  harvestDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
