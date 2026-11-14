import { Module } from '@nestjs/common';
import { DriversController, ShipmentController } from './shipment.controller';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { PaymentModule } from '../payment/payment.module';
import { LocationService } from './tracking/location.service';
import { ShipmentService } from './shipment.service';
import { BidService } from './bid.service';

@Module({
  imports: [PaymentModule, LeaderboardModule],
  controllers: [ShipmentController, DriversController],
  providers: [ShipmentService, LocationService, BidService],
  exports: [ShipmentService],
})
export class ShipmentModule {}
