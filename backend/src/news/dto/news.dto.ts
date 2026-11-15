import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { NewsCategory } from '@prisma/client';

const clean = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/[ \t]+/g, ' ') : value);
const bool = ({ value }: { value: unknown }) => (value === 'true' || value === '1' || value === true ? true : value === 'false' || value === '0' || value === false ? false : value);

export class CreateNewsDto {
  @Transform(clean) @IsString() @Length(5, 200, { message: "Sarlavha (uz) 5-200 belgi bo'lishi kerak" })
  titleUz!: string;
  @IsOptional() @Transform(clean) @IsString() @Length(5, 200) titleRu?: string;
  @IsOptional() @Transform(clean) @IsString() @Length(5, 200) titleEn?: string;

  @Transform(clean) @IsString() @Length(10, 1500, { message: "Qisqa matn (uz) 10-1500 belgi bo'lishi kerak" })
  summaryUz!: string;
  @IsOptional() @Transform(clean) @IsString() @Length(10, 1500) summaryRu?: string;
  @IsOptional() @Transform(clean) @IsString() @Length(10, 1500) summaryEn?: string;

  @IsEnum(NewsCategory, { message: "Kategoriya: ROADS, AGRO, MARKET yoki LOGISTICS" })
  category!: NewsCategory;

  @IsOptional() @Transform(clean) @IsString() @Length(2, 60) region?: string;
  @IsOptional() @IsDateString() publishedAt?: string;
  @IsOptional() @Transform(bool) @IsBoolean() isActive?: boolean;
}

export class UpdateNewsDto {
  @IsOptional() @Transform(clean) @IsString() @Length(5, 200) titleUz?: string;
  @IsOptional() @Transform(clean) @IsString() @Length(5, 200) titleRu?: string;
  @IsOptional() @Transform(clean) @IsString() @Length(5, 200) titleEn?: string;
  @IsOptional() @Transform(clean) @IsString() @Length(10, 1500) summaryUz?: string;
  @IsOptional() @Transform(clean) @IsString() @Length(10, 1500) summaryRu?: string;
  @IsOptional() @Transform(clean) @IsString() @Length(10, 1500) summaryEn?: string;
  @IsOptional() @IsEnum(NewsCategory) category?: NewsCategory;
  @IsOptional() @Transform(clean) @IsString() @Length(2, 60) region?: string;
  @IsOptional() @IsDateString() publishedAt?: string;
  @IsOptional() @Transform(bool) @IsBoolean() isActive?: boolean;
  /** true bo'lsa matn o'zgarmasa ham AI xulosalari qayta yaratiladi */
  @IsOptional() @Transform(bool) @IsBoolean() regenerateInsights?: boolean;
}

export class ListNewsQuery {
  @IsOptional() @IsEnum(NewsCategory) category?: NewsCategory;
  @IsOptional() @Transform(clean) @IsString() @Length(0, 60) region?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
  @IsOptional() @Transform(bool) @IsBoolean() includeInactive?: boolean;
}
