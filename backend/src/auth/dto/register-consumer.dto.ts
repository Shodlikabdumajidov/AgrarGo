import { IsOptional, IsString, MinLength } from 'class-validator';
import { RegisterBaseDto } from './register-base.dto';

export class RegisterConsumerDto extends RegisterBaseDto {
  @IsString()
  @MinLength(2, { message: 'Viloyatni kiriting' })
  region: string;

  @IsString()
  @MinLength(2, { message: 'Tuman yoki shaharni kiriting' })
  district: string;

  @IsOptional()
  @IsString()
  address?: string;
}
