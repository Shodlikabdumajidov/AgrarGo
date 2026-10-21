import { HubIntakeStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, Min, ValidateNested } from 'class-validator';
import { DockSlotInput } from './dock.dto';

const clean = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value);
const kg = { maxDecimalPlaces: 2 };

export class CreateHubDto {
  @Transform(clean) @IsString() @Length(2, 80, { message: "Hub nomi 2-80 belgi bo'lsin" })
  name!: string;

  @Transform(clean) @IsString() @Length(2, 60, { message: 'Viloyatni kiriting' })
  region!: string;

  @IsOptional() @Transform(clean) @IsString() @Length(0, 80)
  district?: string;

  @IsOptional() @Transform(clean) @IsString() @Length(0, 200)
  address?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90)
  lat?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180)
  lng?: number;
}

export class UpdateHubDto {
  @IsOptional() @Transform(clean) @IsString() @Length(2, 80) name?: string;
  @IsOptional() @Transform(clean) @IsString() @Length(2, 60) region?: string;
  @IsOptional() @Transform(clean) @IsString() @Length(0, 80) district?: string;
  @IsOptional() @Transform(clean) @IsString() @Length(0, 200) address?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  /** PaaS: qadoqlash xizmati narxi (so'm/kg) */
  @IsOptional() @Type(() => Number) @IsNumber(kg) @Min(0) @Max(1_000_000) packagingFeePerKg?: number;
}

export class AssignStaffDto {
  @IsUUID('all', { message: "Foydalanuvchi identifikatori noto'g'ri" })
  userId!: string;
}

/** Fermer yirik partiyani Hub omboriga topshirishni e'lon qiladi va chakana sotuv shartlarini belgilaydi */
export class AnnounceIntakeDto {
  @IsUUID('all') productId!: string;
  @IsUUID('all') hubId!: string;

  @Type(() => Number) @IsNumber(kg, { message: "Miqdor kg da, 2 xonagacha kasr bilan bo'lsin" }) @Min(1, { message: 'Kamida 1 kg' }) @Max(1_000_000)
  declaredKg!: number;

  @Type(() => Number) @IsNumber(kg) @Min(1, { message: "Chakana narx 0 dan katta bo'lsin" }) @Max(1_000_000_000)
  retailPricePerKg!: number;

  @IsOptional() @Type(() => Number) @IsNumber(kg) @Min(1) @Max(5000)
  minOrderKg?: number;

  /** Partiyadagi quti (tara) soni: berilsa Master QR avtomatik yaratiladi */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000)
  boxCount?: number;

  /** PaaS: Hub'da qadoqlash xizmatidan foydalanish */
  @IsOptional() @IsBoolean()
  usePackaging?: boolean;

  /** Yuk tushiriladigan rampa va vaqt (Hub majburiy qilsa — shart) */
  @IsOptional() @ValidateNested() @Type(() => DockSlotInput)
  dockSlot?: DockSlotInput;
}

export class ReceiveIntakeDto {
  @Type(() => Number) @IsNumber(kg, { message: 'Qabul qilingan vazn (kg) kerak' }) @Min(0.01) @Max(1_000_000)
  receivedKg!: number;

  @IsOptional() @Transform(clean) @IsString() @Length(0, 300)
  note?: string;
}

export class RejectIntakeDto {
  @Transform(clean) @IsString() @Length(3, 300, { message: 'Rad etish sababini yozing (3-300 belgi)' })
  note!: string;
}

export class SetRetailDto {
  @IsOptional() @IsBoolean() isRetail?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber(kg) @Min(1) @Max(1_000_000_000) retailPricePerKg?: number;
  @IsOptional() @Type(() => Number) @IsNumber(kg) @Min(1) @Max(5000) minOrderKg?: number;
}

export class AdjustStockDto {
  @Type(() => Number) @IsNumber(kg) @Min(-1_000_000) @Max(1_000_000) deltaKg!: number;
  @Transform(clean) @IsString() @Length(3, 200, { message: 'Tuzatish sababini yozing (3-200 belgi)' }) note!: string;
}

export class ListIntakesQuery {
  @IsOptional() @IsEnum(HubIntakeStatus) status?: HubIntakeStatus;
  @IsOptional() @IsUUID('all') hubId?: string;
}

/** Master QR biriktirish: quti soni majburiy; kod berilmasa tizim yaratadi (yorliq oldindan bosilgan bo'lsa — skanerlangan kod) */
export class MasterQrDto {
  @Type(() => Number) @IsInt({ message: "Quti soni butun son bo'lsin" }) @Min(1) @Max(100000)
  boxCount!: number;

  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, '').toUpperCase() : value)) @Matches(/^[A-Z0-9][A-Z0-9._-]{5,39}$/, { message: "QR kod 6-40 ta lotin harf/raqamdan iborat bo'lsin" })
  code?: string;
}

/** Skaner orqali qabul: to'liq yoki qisman ziyon (yaroqsiz qutilar soni bilan) */
export class ScanReceiveDto {
  @IsIn(['FULL', 'PARTIAL'], { message: "Rejim FULL yoki PARTIAL bo'lsin" })
  mode!: 'FULL' | 'PARTIAL';

  @IsOptional() @Type(() => Number) @IsInt({ message: "Yaroqsiz qutilar soni butun son bo'lsin" }) @Min(1) @Max(100000)
  damagedBoxes?: number;

  @IsOptional() @Transform(clean) @IsString() @Length(0, 300)
  note?: string;
}

export class OsdQuery {
  @IsOptional() @IsUUID('all') hubId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
