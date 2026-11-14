import { DockPurpose } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';

const clean = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value);
const HHMM = /^([01]?\d|2[0-4]):[0-5]\d$/;

export class CreateDockDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(99) number?: number;
  @IsOptional() @Transform(clean) @IsString() @Length(0, 40) name?: string;
}

export class UpdateDockDto {
  @IsOptional() @Transform(clean) @IsString() @Length(0, 40) name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class DockSettingsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(10, { message: "Slot kamida 10 daqiqa bo'lsin" }) @Max(240) slotMinutes?: number;
  @IsOptional() @Matches(HHMM, { message: "Ochilish vaqti HH:MM ko'rinishida bo'lsin" }) openTime?: string;
  @IsOptional() @Matches(HHMM, { message: "Yopilish vaqti HH:MM ko'rinishida bo'lsin" }) closeTime?: string;
  @IsOptional() @IsBoolean() requireDockBooking?: boolean;
}

export class DayQuery {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Sana YYYY-MM-DD ko'rinishida bo'lsin" }) date!: string;
}

/** Fermer yuk topshirishni e'lon qilayotganda rampa va vaqtni shu yerda tanlaydi (dockId bo'sh bo'lsa tizim bo'sh rampani o'zi tanlaydi) */
export class DockSlotInput {
  @IsDateString({}, { message: 'Slot boshlanish vaqti noto\'g\'ri' }) startsAt!: string;
  @IsOptional() @IsUUID('all') dockId?: string;
  @IsOptional() @Transform(clean) @IsString() @Length(0, 20) vehiclePlate?: string;
}

export class BookDockDto extends DockSlotInput {
  @IsUUID('all') hubId!: string;
  @IsEnum(DockPurpose) purpose!: DockPurpose;
  @IsOptional() @IsUUID('all') intakeId?: string;
  @IsOptional() @Transform(clean) @IsString() @Length(0, 200) note?: string;
}

export class CancelDockDto {
  @IsOptional() @Transform(clean) @IsString() @Length(0, 200) reason?: string;
}

