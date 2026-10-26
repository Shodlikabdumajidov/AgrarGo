import { Module } from '@nestjs/common';
import { DriversController, ShipmentController } from './shipment.controller';
import { PaymentModule } from '../payment/payment.module';
import { LocationService } from './tracking/location.service';
import { ShipmentService } from './shipment.service';

@Module({
  imports: [PaymentModule],
  controllers: [ShipmentController, DriversController],
  providers: [ShipmentService, LocationService],
  exports: [ShipmentService],
})
export class ShipmentModule {}
