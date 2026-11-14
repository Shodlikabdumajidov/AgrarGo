import { HttpTelegramApi, TelegramApiError } from './telegram-api';

describe('HttpTelegramApi', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });
  const reply = (body: unknown, status = 200) => ({ status, json: async () => body }) as Response;

  it("inline tugmalar: callback_data va url to'g'ri shakllanadi, token faqat manzilda", async () => {
    const calls: { url: string; body: any }[] = [];
    global.fetch = jest.fn(async (url: any, init: any) => { calls.push({ url: String(url), body: JSON.parse(init.body) }); return reply({ ok: true, result: true }); }) as any;
    await new HttpTelegramApi('123:TOKEN').sendMessage('5', '<b>x</b>', [[{ text: 'Ha', callback: 'bk:a:1' }, { text: 'Sayt', url: 'https://agrargo.uz' }]]);
    expect(calls[0].url).toBe('https://api.telegram.org/bot123:TOKEN/sendMessage');
    expect(calls[0].body.reply_markup).toEqual({ inline_keyboard: [[{ text: 'Ha', callback_data: 'bk:a:1' }, { text: 'Sayt', url: 'https://agrargo.uz' }]] });
    expect(JSON.stringify(calls[0].body)).not.toContain('TOKEN');
  });

  it("429: aytilgan vaqtdan keyin bir marta qayta uriniladi; 403 TelegramApiError bo'ladi (xato matnida token yo'q)", async () => {
    jest.useFakeTimers();
    let n = 0;
    global.fetch = jest.fn(async () => (++n === 1 ? reply({ ok: false, error_code: 429, description: 'Too Many Requests: retry after 1' }, 429) : reply({ ok: true, result: true }))) as any;
    const p = new HttpTelegramApi('123:SECRET').sendMessage('5', 'x');
    await jest.advanceTimersByTimeAsync(1100);
    await p;
    expect(n).toBe(2);
    jest.useRealTimers();
    global.fetch = jest.fn(async () => reply({ ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' }, 403)) as any;
    const err = await new HttpTelegramApi('123:SECRET').sendMessage('5', 'x').catch((e) => e);
    expect(err).toBeInstanceOf(TelegramApiError);
    expect(err.code).toBe(403);
    expect(String(err.message)).not.toContain('SECRET');
    global.fetch = jest.fn(async () => { throw new Error('ECONNRESET 123:SECRET'); }) as any;
    const net = await new HttpTelegramApi('123:SECRET').sendMessage('5', 'x').catch((e) => e);
    expect(String(net.message)).not.toContain('SECRET');
  });
});
