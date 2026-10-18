import { ProductStatus, Role, ShipmentStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, Matches, Max, MaxLength, Min, MinLength,
} from 'class-validator';
import { IsStrongPassword } from '../../auth/password/password-policy';

const emptyToUndefined = ({ value }: { value: unknown }) => (typeof value === 'string' && value.trim() === '' ? undefined : value);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;
}

export class UsersQuery extends PageQuery {
  @IsOptional() @Transform(emptyToUndefined) @IsEnum(Role)
  role?: Role;

  @IsOptional() @Transform(emptyToUndefined) @IsIn(['true', 'false'])
  active?: 'true' | 'false';

  @IsOptional() @Transform(emptyToUndefined) @IsString() @MaxLength(60)
  q?: string;
}

export class SetStatusDto {
  @IsBoolean()
  isActive!: boolean;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(300)
  reason?: string;
}

export class CreateStaffDto {
  @Matches(/^\+998\d{9}$/, { message: "Telefon raqam +998XXXXXXXXX formatida bo'lishi kerak" })
  phone!: string;

  @IsStrongPassword()
  password!: string;

  @Transform(trim) @IsString() @MinLength(2) @MaxLength(100)
  fullName!: string;

  @IsIn([Role.DISPATCHER, Role.ADMIN])
  role!: Role;
}

export class SetPasswordDto {
  @IsStrongPassword()
  password!: string;
}

export class ProductsQuery extends PageQuery {
  @IsOptional() @Transform(emptyToUndefined) @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional() @Transform(emptyToUndefined) @IsString() @MaxLength(60)
  q?: string;
}

export class UpdateProductDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(100)
  name?: string;

  @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(50)
  category?: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() @Max(9_999_999_999)
  quantityKg?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @IsPositive() @Max(9_999_999_999)
  pricePerKg?: number;

  @IsOptional() @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000)
  description?: string;
}

export class ShipmentsQuery extends PageQuery {
  @IsOptional() @Transform(emptyToUndefined) @IsEnum(ShipmentStatus)
  status?: ShipmentStatus;
}

export class AuditQuery extends PageQuery {
  @IsOptional() @Transform(emptyToUndefined) @IsString() @MaxLength(40)
  entity?: string;
}
