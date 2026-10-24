import { IsUUID } from 'class-validator';

export class ChainAcceptDto {
  @IsUUID('all', { message: "Birinchi yuk identifikatori noto'g'ri" })
  firstId!: string;

  @IsUUID('all', { message: "Ikkinchi yuk identifikatori noto'g'ri" })
  secondId!: string;
}
