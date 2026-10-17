import { IsOptional, IsString, Matches, MinLength, MaxLength, IsNumber } from 'class-validator';

export const UZ_PHONE_REGEX = /^\+998\d{9}$/;

export class RegisterFarmerDto {
  @Matches(UZ_PHONE_REGEX, { message: "Telefon raqam +998XXXXXXXXX formatida bo'lishi kerak" })
  phone: string;

  @IsString()
  @MinLength(8, { message: "Parol kamida 8 ta belgidan iborat bo'lishi kerak" })
  @MaxLength(72)
  password: string;

  @IsString()
  @MinLength(2)
  fullName: string;

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
