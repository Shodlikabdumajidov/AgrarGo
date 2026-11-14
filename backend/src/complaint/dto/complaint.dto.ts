import { ComplaintStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateComplaintDto {
  @IsUUID(undefined, { message: "Hamkor identifikatori noto'g'ri" })
  accusedId: string;

  @IsString()
  @MinLength(10, { message: "Sababni batafsilroq yozing (kamida 10 ta belgi)" })
  @MaxLength(1000, { message: "Sabab 1000 belgidan oshmasin" })
  reason: string;
}

export const DECISIONS = ['UPHELD', 'PARTIAL', 'REJECTED'] as const;
export type Decision = (typeof DECISIONS)[number];

export class DecideComplaintDto {
  @IsIn(DECISIONS, { message: "Qaror UPHELD (to'liq asosli), PARTIAL (qisman asosli) yoki REJECTED (asossiz) bo'lishi kerak" })
  decision: Decision;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

const empty = ({ value }: { value: unknown }) => (typeof value === 'string' && value.trim() === '' ? undefined : value);
export class ListComplaintsQuery {
  @IsOptional()
  @Transform(empty)
  @IsEnum(ComplaintStatus)
  status?: ComplaintStatus;
}
