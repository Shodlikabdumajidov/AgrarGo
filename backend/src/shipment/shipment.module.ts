import { Module } from '@nestjs/common';
import { DriversController, ShipmentController } from './shipment.controller';
import { LocationService } from './tracking/location.service';
import { ShipmentService } from './shipment.service';

@Module({
  controllers: [ShipmentController, DriversController],
  providers: [ShipmentService, LocationService],
  exports: [ShipmentService],
})
export class ShipmentModule {}
