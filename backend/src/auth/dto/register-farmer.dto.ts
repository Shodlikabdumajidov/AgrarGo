import { IsNumber, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { RegisterBaseDto } from './register-base.dto';

export { UZ_PHONE_REGEX } from './register-base.dto';

export class RegisterFarmerDto extends RegisterBaseDto {
  @IsString()
  @MinLength(2)
  farmName: string;

  @IsString()
  region: string;

  @IsString()
  district: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  // STIR ixtiyoriy: isVerified bosqichida to'ldiriladi
  @IsOptional()
  @Matches(/^\d{9}$/, { message: "STIR 9 ta raqamdan iborat bo'lishi kerak" })
  stir?: string;
}
