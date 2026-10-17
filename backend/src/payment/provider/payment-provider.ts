import { randomBytes } from 'crypto';

export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER_ADAPTER';

export interface ProviderRequest {
  paymentId: string;
  amount: string; // aniq o'nlik son (matn), float emas
  currency: string;
}

export interface ProviderResult {
  ref: string;
}

/**
 * To'lov provayderi adapteri. Haqiqiy integratsiya (Payme, Click, Uzum...) shu interfeysni amalga oshiradi.
 * Haqiqiy provayderlarda: kutish rejimi (checkout + webhook) va qayta urinishda takrorlanmaslik (idempotency key) kerak.
 */
export interface PaymentProvider {
  readonly name: string;
  /** Xaridordan mablag'ni escrow'ga yechib oladi */
  charge(req: ProviderRequest): Promise<ProviderResult>;
  /** Escrow'dagi mablag'ni fermerga o'tkazadi */
  payout(req: ProviderRequest): Promise<ProviderResult>;
  /** Escrow'dagi mablag'ni xaridorga qaytaradi */
  refund(req: ProviderRequest): Promise<ProviderResult>;
}

/** Test/demo rejimi: haqiqiy pul harakati yo'q, har doim muvaffaqiyatli. */
export class SimulatedPaymentProvider implements PaymentProvider {
  readonly name = 'simulated';
  private ref = (kind: string) => `SIM-${kind}-${randomBytes(6).toString('hex')}`;
  async charge() { return { ref: this.ref('CHG') }; }
  async payout() { return { ref: this.ref('OUT') }; }
  async refund() { return { ref: this.ref('REF') }; }
}
