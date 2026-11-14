import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
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

  /** POST /auth/verify-otp (REGISTER) dan olingan bir martalik token; REGISTER_OTP_ENFORCE yoqilganda majburiy */
  @IsOptional() @IsString() @MaxLength(100)
  otpToken?: string;
}
