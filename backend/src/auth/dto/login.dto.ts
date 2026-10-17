import { IsString, Matches } from 'class-validator';
import { UZ_PHONE_REGEX } from './register-farmer.dto';

export class LoginDto {
  @Matches(UZ_PHONE_REGEX, { message: "Telefon raqam +998XXXXXXXXX formatida bo'lishi kerak" })
  phone: string;

  @IsString()
  password: string;
}
