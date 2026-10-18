import { Logger } from '@nestjs/common';
import { SimulatedSmsProvider } from './sms-provider';

describe('SimulatedSmsProvider', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => { warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined); });
  afterEach(() => warn.mockRestore());

  it("development'da xabar matnini (kodni) jurnalga yozadi", async () => {
    await new SimulatedSmsProvider(true).send('+998901234567', 'kod 123456');
    expect(warn.mock.calls.flat().join(' ')).toContain('123456');
  });

  it("production'da kodni jurnalga yozmaydi va raqamni niqoblaydi", async () => {
    await new SimulatedSmsProvider(false).send('+998901234567', 'kod 123456');
    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).not.toContain('123456');
    expect(logged).not.toContain('+998901234567');
    expect(logged).toContain('+998901***');
  });
});
