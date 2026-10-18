import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsPositive, IsString, Matches, Max, MinLength, ValidateIf } from 'class-validator';
import { PLATE_REGEX, normalizePlate } from '../../auth/dto/register-driver.dto';

// Majburiy maydonlar: yuborilmasa o'zgarmaydi, yuborilsa null/bo'sh bo'lmasligi kerak (ValidateIf).
// Ixtiyoriy maydonlar: null yoki "" yuborilsa tozalanadi.
const blankToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : typeof value === 'string' ? value.trim() : value;

const STIR_MSG = "STIR 9 ta raqamdan iborat bo'lishi kerak";

class BaseProfileDto {
  @ValidateIf((o) => o.fullName !== undefined)
  @IsString()
  @MinLength(2, { message: "Ism kamida 2 ta belgidan iborat bo'lishi kerak" })
  fullName?: string;
}

export class UpdateFarmerProfileDto extends BaseProfileDto {
  @ValidateIf((o) => o.farmName !== undefined)
  @IsString()
  @MinLength(2, { message: "Xo'jalik nomi kamida 2 ta belgi bo'lishi kerak" })
  farmName?: string;

  @ValidateIf((o) => o.region !== undefined)
  @IsString()
  @MinLength(2, { message: 'Viloyatni kiriting' })
  region?: string;

  @ValidateIf((o) => o.district !== undefined)
  @IsString()
  @MinLength(2, { message: 'Tumanni kiriting' })
  district?: string;

  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsNumber()
  latitude?: number | null;

  @IsOptional()
  @IsNumber()
  longitude?: number | null;

  @IsOptional()
  @Transform(blankToNull)
  @Matches(/^\d{9}$/, { message: STIR_MSG })
  stir?: string | null;
}

export class UpdateDriverProfileDto extends BaseProfileDto {
  @ValidateIf((o) => o.vehicleType !== undefined)
  @IsString()
  @MinLength(2, { message: 'Transport turini kiriting' })
  vehicleType?: string;

  @ValidateIf((o) => o.plateNumber !== undefined)
  @Transform(normalizePlate)
  @Matches(PLATE_REGEX, { message: "Davlat raqami noto'g'ri: faqat KATTA lotin harflari va raqamlar (masalan, 01A777AA yoki 70777AAA)" })
  plateNumber?: string;

  @ValidateIf((o) => o.capacityKg !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Yuk sig'imi raqam bo'lishi kerak (kg)" })
  @IsPositive({ message: "Yuk sig'imi 0 dan katta bo'lishi kerak" })
  @Max(1_000_000)
  capacityKg?: number;

  @ValidateIf((o) => o.region !== undefined)
  @IsString()
  @MinLength(2, { message: 'Viloyatni kiriting' })
  region?: string;

  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  licenseNumber?: string | null;
}

export class UpdateMarketProfileDto extends BaseProfileDto {
  @ValidateIf((o) => o.companyName !== undefined)
  @IsString()
  @MinLength(2, { message: 'Kompaniya nomini kiriting' })
  companyName?: string;

  @ValidateIf((o) => o.region !== undefined)
  @IsString()
  @MinLength(2, { message: 'Viloyatni kiriting' })
  region?: string;

  @ValidateIf((o) => o.district !== undefined)
  @IsString()
  @MinLength(2, { message: 'Tumanni kiriting' })
  district?: string;

  @IsOptional()
  @Transform(blankToNull)
  @IsString()
  address?: string | null;

  @IsOptional()
  @Transform(blankToNull)
  @Matches(/^\d{9}$/, { message: STIR_MSG })
  stir?: string | null;
}
