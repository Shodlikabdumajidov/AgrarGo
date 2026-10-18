import { Logger } from '@nestjs/common';

export const SMS_PROVIDER = 'SMS_PROVIDER_ADAPTER';

/**
 * SMS provayder adapteri. Haqiqiy integratsiya (Eskiz, Playmobile va h.k.) shu interfeysni amalga oshiradi.
 * Xato bo'lsa istisno tashlaydi: chaqiruvchi uni jurnalga yozadi, foydalanuvchiga ichki tafsilot oshkor qilinmaydi.
 */
export interface SmsProvider {
  readonly name: string;
  send(to: string, text: string): Promise<void>;
}

const logger = new Logger('SMS');

/**
 * Test/demo rejimi: SMS yuborilmaydi, faqat jurnalga yoziladi.
 * Production'da (faqat SMS_ALLOW_SIMULATION=true bilan) xabar matni, ya'ni kod jurnalga yozilmaydi.
 */
export class SimulatedSmsProvider implements SmsProvider {
  readonly name = 'simulated';
  constructor(private readonly logBody: boolean) {}

  async send(to: string, text: string): Promise<void> {
    if (this.logBody) logger.warn(`[SIMULATSIYA] ${to} raqamiga SMS: ${text}`);
    else logger.warn(`[SIMULATSIYA] ${to.slice(0, 7)}*** raqamiga SMS yuborilmadi (haqiqiy provayder ulanmagan)`);
  }
}
