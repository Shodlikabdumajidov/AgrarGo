import { PaymentStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class InitPaymentDto {
  @IsUUID(undefined, { message: "Bron identifikatori noto'g'ri" })
  bookingId: string;

  /** Keshbek balansidan platforma xizmat haqini qoplash uchun foydalanish */
  @IsOptional()
  @IsBoolean()
  useCashback?: boolean;
}

export class ReleasePaymentDto {
  @IsUUID(undefined, { message: "Bron identifikatori noto'g'ri" })
  bookingId: string;
}

export class RefundPaymentDto {
  @IsUUID(undefined, { message: "Bron identifikatori noto'g'ri" })
  bookingId: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class ListPaymentsQuery {
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;
}
