import { BookingStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListBookingsQuery {
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}
