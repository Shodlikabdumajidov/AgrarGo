import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PAYMENT_PROVIDER, SimulatedPaymentProvider } from './provider/payment-provider';

@Module({
  controllers: [PaymentController],
  exports: [PaymentService, PAYMENT_PROVIDER],
  providers: [
    PaymentService,
    // Haqiqiy provayder (Payme, Click...) qo'shilganda faqat shu yerda almashtiriladi
    { provide: PAYMENT_PROVIDER, useFactory: () => new SimulatedPaymentProvider() },
  ],
})
export class PaymentModule {}
