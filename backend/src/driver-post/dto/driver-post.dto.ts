import { DriverExtra, DriverPostStatus, TrailerType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsDate, IsEnum, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

const clean = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value);
const cleanList = ({ value }: { value: unknown }) => (Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : v)) : value);
const emptyToUndef = ({ value }: { value: unknown }) => (value === '' || value === null ? undefined : value);

export class CreateDriverPostDto {
  @IsEnum(DriverPostStatus, { message: "Holat AVAILABLE yoki ON_ROUTE bo'lishi kerak" })
  status!: DriverPostStatus;

  @IsEnum(TrailerType, { message: "Tirkama turi noto'g'ri" })
  trailerType!: TrailerType;

  @Type(() => Number)
  @IsInt({ message: "Sig'im butun son (kg) bo'lishi kerak" })
  @Min(100, { message: "Sig'im kamida 100 kg" })
  @Max(60_000)
  capacityKg!: number;

  @Transform(cleanList)
  @IsArray()
  @ArrayMaxSize(8, { message: "Yo'nalishlar 8 tadan oshmasligi kerak" })
  @IsString({ each: true })
  @Length(2, 60, { each: true, message: "Har bir yo'nalish 2-60 belgi bo'lishi kerak" })
  routes!: string[];

  @IsOptional() @Transform(clean) @IsString() @Length(0, 60)
  workHours?: string;

  @Transform(clean)
  @IsString()
  @Length(2, 80, { message: "Joriy joylashuv 2-80 belgi bo'lishi kerak" })
  currentLocation!: string;

  @IsOptional() @Transform(emptyToUndef) @Type(() => Number) @IsInt() @Min(0) @Max(2880)
  pickupEtaMinutes?: number;

  @IsOptional() @Transform(emptyToUndef) @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000)
  pricePerKm?: number;

  @IsOptional() @Transform(clean) @IsString() @Length(0, 120)
  priceNote?: string;

  @IsOptional() @IsArray() @ArrayUnique() @IsEnum(DriverExtra, { each: true, message: "Qo'shimcha xizmat turi noto'g'ri" })
  extras?: DriverExtra[];

  @IsOptional() @Transform(clean) @IsString() @Length(0, 500)
  description?: string;

  @IsOptional() @Transform(emptyToUndef) @Type(() => Date) @IsDate()
  deliveryEtaAt?: Date;

  @IsOptional() @Transform(emptyToUndef) @Type(() => Date) @IsDate()
  returnPickupAt?: Date;

  @IsOptional() @IsBoolean()
  wantsBackhaul?: boolean;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class UpdateDriverPostDto {
  @IsOptional() @IsEnum(DriverPostStatus) status?: DriverPostStatus;
  @IsOptional() @IsEnum(TrailerType) trailerType?: TrailerType;
  @IsOptional() @Type(() => Number) @IsInt() @Min(100) @Max(60_000) capacityKg?: number;
  @IsOptional() @Transform(cleanList) @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) @Length(2, 60, { each: true }) routes?: string[];
  @IsOptional() @Transform(clean) @IsString() @Length(0, 60) workHours?: string;
  @IsOptional() @Transform(clean) @IsString() @Length(2, 80) currentLocation?: string;
  @IsOptional() @Transform(emptyToUndef) @Type(() => Number) @IsInt() @Min(0) @Max(2880) pickupEtaMinutes?: number;
  @IsOptional() @Transform(emptyToUndef) @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000) pricePerKm?: number;
  @IsOptional() @Transform(clean) @IsString() @Length(0, 120) priceNote?: string;
  @IsOptional() @IsArray() @ArrayUnique() @IsEnum(DriverExtra, { each: true }) extras?: DriverExtra[];
  @IsOptional() @Transform(clean) @IsString() @Length(0, 500) description?: string;
  @IsOptional() @Transform(emptyToUndef) @Type(() => Date) @IsDate() deliveryEtaAt?: Date;
  @IsOptional() @Transform(emptyToUndef) @Type(() => Date) @IsDate() returnPickupAt?: Date;
  @IsOptional() @IsBoolean() wantsBackhaul?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ListDriverPostsQuery {
  @IsOptional() @Transform(clean) @IsString() @Length(0, 80) q?: string;
  @IsOptional() @IsEnum(DriverPostStatus) status?: DriverPostStatus;
  @IsOptional() @IsEnum(TrailerType) trailerType?: TrailerType;
  @IsOptional() @Transform(clean) @IsString() @Length(0, 60) region?: string;
  /** vergul bilan ajratilgan: LOADERS,LIFTGATE */
  @IsOptional() @IsString() @Length(0, 120) extras?: string;
}
