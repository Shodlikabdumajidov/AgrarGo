import { AgroMode, AgroSupplierType, AgroVerification } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { IsStrongPassword } from '../auth/password/password-policy';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToUndefined = ({ value }: { value: unknown }) => (typeof value === 'string' && value.trim() === '' ? undefined : value);

export class CreateSupplierDto {
  @IsEnum(AgroSupplierType, { message: "Sotuvchi turi: PHARMACY (Dorixona) yoki FERTILIZER (O'g'it sotuvchi)" })
  type!: AgroSupplierType;

  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120)
  orgName!: string;

  @Transform(trim) @IsString() @MinLength(2) @MaxLength(100)
  contactName!: string;

  @Matches(/^\+998\d{9}$/, { message: "Telefon raqam +998XXXXXXXXX formatida bo'lishi kerak" })
  phone!: string;

  @IsStrongPassword()
  password!: string;
}

export class SuppliersQuery {
  @IsOptional() @Transform(emptyToUndefined) @IsEnum(AgroVerification)
  status?: AgroVerification;

  @IsOptional() @Transform(emptyToUndefined) @IsEnum(AgroSupplierType)
  type?: AgroSupplierType;
}

export class RejectSupplierDto {
  @Transform(trim) @IsString() @MinLength(3, { message: 'Sababni yozing' }) @MaxLength(300)
  reason!: string;
}

export class UpdateSupplierProfileDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(100)
  contactName?: string;

  @IsOptional() @Transform(emptyToUndefined) @Transform(trim) @Matches(/^\d{9}$/, { message: "STIR 9 ta raqamdan iborat bo'lishi kerak" })
  stir?: string;

  @IsOptional() @Transform(emptyToUndefined) @Transform(trim) @IsString() @MinLength(5) @MaxLength(200)
  passportInfo?: string;
}

export class ProductDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120)
  name!: string;

  @Transform(trim) @IsString() @MinLength(2) @MaxLength(60)
  category!: string;

  @IsOptional() @IsEnum(AgroMode)
  mode?: AgroMode;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(600)
  description?: string;

  /** Dozasi / ishlatish yo'riqnomasi */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(600)
  usage?: string;

  @Type(() => Number) @IsNumber() @Min(1) @Max(1_000_000_000)
  price!: number;

  @IsOptional() @IsIn(['kg', 'litr', 'dona'])
  unit?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100_000_000)
  stockQty?: number;
}

export class UpdateProductDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(60) category?: string;
  @IsOptional() @IsEnum(AgroMode) mode?: AgroMode;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(600) description?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(600) usage?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(1_000_000_000) price?: number;
  @IsOptional() @IsIn(['kg', 'litr', 'dona']) unit?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100_000_000) stockQty?: number;
  @IsOptional() isActive?: boolean;
}
