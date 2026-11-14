import { Module } from '@nestjs/common';
import { HubModule } from '../hub/hub.module';
import { PaymentModule } from '../payment/payment.module';
import { LocalMarketController, LocalOrdersController } from './local.controller';
import { LocalOrderService } from './local-order.service';

@Module({ imports: [HubModule, PaymentModule], controllers: [LocalMarketController, LocalOrdersController], providers: [LocalOrderService] })
export class LocalModule {}
