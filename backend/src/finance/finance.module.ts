import { Module } from '@nestjs/common';
import { PaymentModule } from '../payment/payment.module';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({ imports: [PaymentModule], controllers: [FinanceController], providers: [FinanceService] })
export class FinanceModule {}
