import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsPositive, IsString, Matches, Max, MinLength } from 'class-validator';
import { RegisterBaseDto } from './register-base.dto';

/** Davlat raqami: faqat KATTA lotin harflari va raqamlar. 01A777AA (jismoniy) yoki 70777AAA (yuridik) */
export const PLATE_REGEX = /^\d{2}(?:[A-Z]\d{3}[A-Z]{2}|\d{3}[A-Z]{3})$/;
export const normalizePlate = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/[\s-]/g, '').toUpperCase() : value);

export class RegisterDriverDto extends RegisterBaseDto {
  @IsString()
  @MinLength(2, { message: 'Transport turini kiriting' })
  vehicleType: string;

  @Transform(normalizePlate)
  @Matches(PLATE_REGEX, { message: "Davlat raqami noto'g'ri: faqat KATTA lotin harflari va raqamlar (masalan, 01A777AA yoki 70777AAA)" })
  plateNumber: string;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Yuk sig'imi raqam bo'lishi kerak (kg)" })
  @IsPositive({ message: "Yuk sig'imi 0 dan katta bo'lishi kerak" })
  @Max(1_000_000)
  capacityKg: number;

  @IsString()
  region: string;

  @IsOptional()
  @IsString()
  licenseNumber?: string;
}
