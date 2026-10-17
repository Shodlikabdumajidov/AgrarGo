import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const UZ_PHONE_REGEX = /^\+998\d{9}$/;

export class RegisterBaseDto {
  @Matches(UZ_PHONE_REGEX, { message: "Telefon raqam +998XXXXXXXXX formatida bo'lishi kerak" })
  phone: string;

  @IsString()
  @MinLength(8, { message: "Parol kamida 8 ta belgidan iborat bo'lishi kerak" })
  @MaxLength(72)
  password: string;

  @IsString()
  @MinLength(2)
  fullName: string;
}
