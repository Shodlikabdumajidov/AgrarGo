import { IsNumber, IsOptional, IsPositive, IsString, Matches, Max, MinLength } from 'class-validator';
import { RegisterBaseDto } from './register-base.dto';

export const PLATE_REGEX = /^[A-Za-z0-9 -]{5,12}$/;

export class RegisterDriverDto extends RegisterBaseDto {
  @IsString()
  @MinLength(2, { message: 'Transport turini kiriting' })
  vehicleType: string;

  @Matches(PLATE_REGEX, { message: "Davlat raqami noto'g'ri (masalan, 01A123BC)" })
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
