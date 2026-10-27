import { QualityGrade, SizeClass, StorageType, WarehouseItemStatus, WarehouseOrderStatus, WarehouseZone } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength,
} from 'class-validator';
import { WAREHOUSE_CATEGORIES } from '../warehouse.policy';

const FINITE = { allowNaN: false, allowInfinity: false };
const KG = { ...FINITE, maxDecimalPlaces: 2 };
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToUndefined = ({ value }: { value: unknown }) => (typeof value === 'string' && value.trim() === '' ? undefined : value);

export class AnnounceItemDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(80)
  name!: string;

  @IsIn(WAREHOUSE_CATEGORIES as unknown as string[], { message: `category quyidagilardan biri bo'lishi kerak: ${WAREHOUSE_CATEGORIES.join(', ')}` })
  category!: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(500)
  description?: string;

  @IsNumber(KG) @Min(1) @Max(1_000_000)
  declaredWeightKg!: number;

  @IsNumber({ ...FINITE, maxDecimalPlaces: 2 }) @Min(1) @Max(1_000_000_000)
  pricePerKg!: number;
}

export class ReceiveDto {
  @IsNumber(KG) @Min(0.01) @Max(1_000_000)
  measuredWeightKg!: number;

  @IsOptional() @Transform(trim) @Matches(/^[A-Za-z0-9-]{4,64}$/, { message: "rfidTag 4-64 ta harf, raqam yoki '-' bo'lishi kerak" })
  rfidTag?: string;
}

export class InspectDto {
  @IsBoolean()
  accept!: boolean;

  @IsOptional() @IsEnum(QualityGrade)
  grade?: QualityGrade;

  @IsOptional() @IsNumber(KG) @Min(0) @Max(1_000_000)
  rejectedKg?: number;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(500)
  notes?: string;
}

export class MoveDto {
  @IsIn(['STORAGE', 'SORTING', 'OUTBOUND'])
  zone!: WarehouseZone;

  @IsOptional() @IsUUID()
  unitId?: string;

  // Sovuq talab qiladigan mahsulotni mos bo'lmagan joyga qo'yishga dispetcher majburlashi (sabab bilan)
  @IsOptional() @IsBoolean()
  override?: boolean;
}

export class SortDto {
  @IsOptional() @IsEnum(SizeClass)
  sizeClass?: SizeClass;

  @IsOptional() @IsNumber(KG) @Min(0) @Max(1_000_000)
  rejectedKg?: number;

  @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(60)
  packagingType?: string;

  @IsOptional() @IsNumber(KG) @Min(0.01) @Max(1000)
  packageWeightKg?: number;
}

export class CountDto {
  @IsNumber(KG) @Min(0) @Max(1_000_000)
  countedKg!: number;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(300)
  note?: string;
}

export class CreateUnitDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(60)
  name!: string;

  @IsEnum(StorageType)
  type!: StorageType;

  @IsNumber(KG) @Min(1) @Max(10_000_000)
  capacityKg!: number;

  @IsOptional() @IsNumber(FINITE) @Min(-30) @Max(40) tempMinC?: number;
  @IsOptional() @IsNumber(FINITE) @Min(-30) @Max(40) tempMaxC?: number;
  @IsOptional() @IsNumber(FINITE) @Min(0) @Max(100) humidityMin?: number;
  @IsOptional() @IsNumber(FINITE) @Min(0) @Max(100) humidityMax?: number;
}

export class ReadingDto {
  @IsNumber(FINITE) @Min(-40) @Max(60)
  tempC!: number;

  @IsNumber(FINITE) @Min(0) @Max(100)
  humidity!: number;
}

export class CreateOrderDto {
  @IsUUID()
  itemId!: string;

  @IsNumber(KG) @Min(0.01) @Max(1_000_000)
  quantityKg!: number;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(300)
  note?: string;
}

export class DispatchDto {
  @IsUUID()
  driverId!: string;
}

class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10_000)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit?: number;
}

export class FeedQuery extends PageQuery {
  @IsOptional() @Transform(emptyToUndefined) @IsString() @MaxLength(60)
  q?: string;

  @IsOptional() @Transform(emptyToUndefined) @IsString() @MaxLength(30)
  category?: string;

  @IsOptional() @Transform(emptyToUndefined) @IsEnum(StorageType)
  storageType?: StorageType;
}

export class ItemsQuery extends PageQuery {
  @IsOptional() @Transform(emptyToUndefined) @IsString() @MaxLength(60)
  q?: string;

  @IsOptional() @Transform(emptyToUndefined) @IsEnum(WarehouseZone)
  zone?: WarehouseZone;

  @IsOptional() @Transform(emptyToUndefined) @IsEnum(WarehouseItemStatus)
  status?: WarehouseItemStatus;
}

export class OrdersQuery {
  @IsOptional() @Transform(emptyToUndefined) @IsEnum(WarehouseOrderStatus)
  status?: WarehouseOrderStatus;
}
