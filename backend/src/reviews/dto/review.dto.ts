import { Role } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const emptyToUndefined = ({ value }: { value: unknown }) => (typeof value === 'string' && value.trim() === '' ? undefined : value);

export const REVIEW_ROLES = [Role.FARMER, Role.DRIVER, Role.MARKET] as const;

export class CreateReviewDto {
  @Type(() => Number) @IsInt({ message: "Baho 1 dan 5 gacha butun son bo'lishi kerak" }) @Min(1, { message: "Baho kamida 1 bo'lishi kerak" }) @Max(5, { message: "Baho ko'pi bilan 5 bo'lishi kerak" })
  rating!: number;

  // Mazmuni (uzunlik, havola va h.k.) ReviewsService.cleanComment da tekshiriladi: xabarlar o'zbekcha
  @IsString({ message: 'Izoh matn bo\'lishi kerak' }) @MaxLength(2000)
  comment!: string;
}

export class ListReviewsQuery {
  @IsOptional() @Transform(emptyToUndefined) @IsIn(REVIEW_ROLES as unknown as string[])
  role?: Role;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50)
  limit?: number;
}

export class AdminReviewsQuery {
  @IsOptional() @Transform(emptyToUndefined) @IsIn(['approved', 'hidden'])
  state?: 'approved' | 'hidden';

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
}

export class SetApprovalDto {
  @IsBoolean()
  isApproved!: boolean;
}
