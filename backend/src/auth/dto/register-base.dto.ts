import { IsString, Matches, MinLength } from 'class-validator';
import { IsStrongPassword } from '../password/password-policy';

export const UZ_PHONE_REGEX = /^\+998\d{9}$/;

export class RegisterBaseDto {
  @Matches(UZ_PHONE_REGEX, { message: "Telefon raqam +998XXXXXXXXX formatida bo'lishi kerak" })
  phone: string;

  @IsStrongPassword()
  password: string;

  @IsString()
  @MinLength(2)
  fullName: string;
}
