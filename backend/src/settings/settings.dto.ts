import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsOptional, IsString, IsUrl, Matches, MaxLength, MinLength, ValidateNested,
} from 'class-validator';

// Faqat https havolalar: "javascript:" va boshqa xavfli sxemalar sahifaga tushib qolmasligi uchun
const HTTPS_URL = { protocols: ['https'], require_protocol: true, require_tld: true, max_allowed_length: 200 };
const httpsMsg = { message: "Havola https:// bilan boshlanadigan to'g'ri URL bo'lishi kerak" };

export class LocalizedTextDto {
  @IsString() @MinLength(1) @MaxLength(120)
  uz!: string;

  @IsString() @MinLength(1) @MaxLength(120)
  ru!: string;

  @IsString() @MinLength(1) @MaxLength(120)
  en!: string;
}

export class UpdateSettingsDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60)
  siteName?: string;

  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(5)
  @Matches(/^\+?[0-9][0-9 ()-]{6,19}$/, { each: true, message: "Telefon raqam noto'g'ri formatda (masalan, +998 78 140 09 09)" })
  callCenterPhones?: string[];

  @IsOptional() @IsEmail({}, { message: "Email manzil noto'g'ri" }) @MaxLength(120)
  supportEmail?: string | null;

  @IsOptional() @Matches(/^@?[A-Za-z0-9_]{3,32}$/, { message: "Telegram nomi noto'g'ri (masalan, @agrargobot)" })
  telegramHandle?: string | null;

  @IsOptional() @IsUrl(HTTPS_URL, httpsMsg) telegramUrl?: string | null;
  @IsOptional() @IsUrl(HTTPS_URL, httpsMsg) instagramUrl?: string | null;
  @IsOptional() @IsUrl(HTTPS_URL, httpsMsg) facebookUrl?: string | null;
  @IsOptional() @IsUrl(HTTPS_URL, httpsMsg) youtubeUrl?: string | null;

  @IsOptional() @ValidateNested() @Type(() => LocalizedTextDto)
  workingHours?: LocalizedTextDto;

  @IsOptional() @ValidateNested() @Type(() => LocalizedTextDto)
  address?: LocalizedTextDto;

  // Omborxona joylashuvi (ombor yuklari marshrutining boshlanish nuqtasi)
  @IsOptional() @IsString() @MinLength(2) @MaxLength(50)
  warehouseRegion?: string;

  @IsOptional() @IsString() @MinLength(2) @MaxLength(80)
  warehouseDistrict?: string;

  @IsOptional() @IsString() @MaxLength(150)
  warehouseAddress?: string | null;
}
