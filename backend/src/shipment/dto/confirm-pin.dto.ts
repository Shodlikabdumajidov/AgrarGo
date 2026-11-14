import { IsString, Matches } from 'class-validator';

export class ConfirmPinDto {
  @IsString()
  @Matches(/^\d{4}$/, { message: "PIN-kod 4 ta raqamdan iborat bo'lishi kerak" })
  pin: string;
}
