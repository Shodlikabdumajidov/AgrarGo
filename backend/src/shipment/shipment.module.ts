import { Module } from '@nestjs/common';
import { ShipmentController } from './shipment.controller';
import { LocationService } from './tracking/location.service';
import { ShipmentService } from './shipment.service';

@Module({
  controllers: [ShipmentController],
  providers: [ShipmentService, LocationService],
  exports: [ShipmentService],
})
export class ShipmentModule {}
