import { Matches } from 'class-validator';

export class SignEBolDto {
  @Matches(/^\d{4}$/, { message: 'Kod 4 ta raqamdan iborat bo\'lishi kerak' })
  code!: string;
}
