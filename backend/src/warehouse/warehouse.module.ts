import { Module } from '@nestjs/common';
import { PaymentModule } from '../payment/payment.module';
import { ShipmentModule } from '../shipment/shipment.module';
import { WarehouseOrderService } from './warehouse-order.service';
import { WarehouseController } from './warehouse.controller';
import { WarehouseService } from './warehouse.service';

@Module({
  imports: [PaymentModule, ShipmentModule],
  controllers: [WarehouseController],
  providers: [WarehouseService, WarehouseOrderService],
})
export class WarehouseModule {}
