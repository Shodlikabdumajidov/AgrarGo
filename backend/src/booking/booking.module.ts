import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { OfferController } from './offer.controller';
import { OfferService } from './offer.service';

@Module({
  controllers: [BookingController, OfferController],
  providers: [BookingService, OfferService],
})
export class BookingModule {}
