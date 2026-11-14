import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateRatingDto {
  @IsUUID(undefined, { message: "Yuk identifikatori noto'g'ri" })
  shipmentId: string;

  @IsIn(['DRIVER', 'FARMER', 'MARKET'], { message: "Baholanayotgan tomon noto'g'ri" })
  targetRole: 'DRIVER' | 'FARMER' | 'MARKET';

  @IsInt({ message: "Baho 1 dan 5 gacha butun son bo'lishi kerak" })
  @Min(1, { message: "Baho 1 dan 5 gacha bo'lishi kerak" })
  @Max(5, { message: "Baho 1 dan 5 gacha bo'lishi kerak" })
  stars: number;

  /** "Juda xushmuomala" tegi (faqat haydovchiga) */
  @IsOptional() @IsBoolean() friendly?: boolean;
  /** Yukka zarar yetgan (faqat haydovchiga) */
  @IsOptional() @IsBoolean() damaged?: boolean;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(300)
  comment?: string;
}
