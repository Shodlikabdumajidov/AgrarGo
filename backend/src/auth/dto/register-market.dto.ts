import { IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { RegisterBaseDto } from './register-base.dto';

export class RegisterMarketDto extends RegisterBaseDto {
  @IsString()
  @MinLength(2, { message: 'Kompaniya nomini kiriting' })
  companyName: string;

  @IsString()
  region: string;

  @IsString()
  district: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @Matches(/^\d{9}$/, { message: "STIR 9 ta raqamdan iborat bo'lishi kerak" })
  stir?: string;
}
