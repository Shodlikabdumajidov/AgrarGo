import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { UZ_PHONE_REGEX } from './register-base.dto';

export class LoginDto {
  @Matches(UZ_PHONE_REGEX, { message: "Telefon raqam +998XXXXXXXXX formatida bo'lishi kerak" })
  phone: string;

  @IsString()
  password: string;

  // Berilsa, raqam aynan shu rolda ro'yxatdan o'tgan bo'lishi shart (sidebar orqali rol tanlanganda)
  @IsOptional()
  @IsIn(['FARMER', 'DRIVER', 'MARKET'])
  role?: 'FARMER' | 'DRIVER' | 'MARKET';
}
