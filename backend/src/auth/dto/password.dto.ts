import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { IsStrongPassword } from '../password/password-policy';
import { RESET_TOKEN_REGEX } from '../password/otp';
import { UZ_PHONE_REGEX } from './register-base.dto';

const PHONE_MSG = "Telefon raqam +998XXXXXXXXX formatida bo'lishi kerak";

export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: 'Joriy parolni kiriting' })
  @MaxLength(128)
  currentPassword: string;

  @IsStrongPassword()
  newPassword: string;
}

export class ForgotPasswordDto {
  @Matches(UZ_PHONE_REGEX, { message: PHONE_MSG })
  phone: string;
}

export class VerifyResetCodeDto {
  @Matches(UZ_PHONE_REGEX, { message: PHONE_MSG })
  phone: string;

  @Matches(/^\d{4,8}$/, { message: "Kod faqat raqamlardan iborat bo'lishi kerak" })
  code: string;
}

export const OTP_PURPOSES = ['REGISTER', 'RESET'] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

/** Telefonni SMS kod bilan tasdiqlash: ro'yxatdan o'tish (REGISTER) yoki parolni tiklash (RESET) */
export class SendOtpDto {
  @Matches(UZ_PHONE_REGEX, { message: PHONE_MSG })
  phone: string;

  @IsIn(OTP_PURPOSES, { message: 'purpose: REGISTER yoki RESET' })
  purpose: OtpPurpose;
}

export class VerifyOtpDto extends SendOtpDto {
  @Matches(/^\d{4,8}$/, { message: "Kod faqat raqamlardan iborat bo'lishi kerak" })
  code: string;
}

export class ResetPasswordDto {
  @Matches(RESET_TOKEN_REGEX, { message: "Tiklash tokeni noto'g'ri" })
  resetToken: string;

  @IsStrongPassword()
  newPassword: string;
}
