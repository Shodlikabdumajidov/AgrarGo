import { Module } from '@nestjs/common';
import { WarehouseOrderService } from './warehouse-order.service';
import { WarehouseController } from './warehouse.controller';
import { WarehouseService } from './warehouse.service';

@Module({
  controllers: [WarehouseController],
  providers: [WarehouseService, WarehouseOrderService],
})
export class WarehouseModule {}
