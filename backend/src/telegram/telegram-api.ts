export const TELEGRAM_API = 'TELEGRAM_API_ADAPTER';

/** Inline tugma: callback (bot ichida tezkor amal) yoki url (https). */
export interface TelegramButton { text: string; callback?: string; url?: string }
export type TelegramKeyboard = TelegramButton[][];

export interface TelegramCallbackQuery {
  id: string;
  data?: string;
  message?: { message_id: number; chat: { id: number; type: string } };
}

export interface TelegramUpdate {
  update_id: number;
  message?: { text?: string; chat: { id: number; type: string } };
  callback_query?: TelegramCallbackQuery;
}

/** Telegram Bot API xatosi (error_code: 403 = bot bloklangan, 409 = webhook/boshqa polling bilan to'qnashuv va h.k.). */
export class TelegramApiError extends Error {
  constructor(readonly code: number, readonly description: string) {
    super(`Telegram API ${code}: ${description}`);
  }
}

/** Bot bilan ishlash adapteri: testlarda soxta amalga oshirish beriladi, production'da HTTP. */
export interface TelegramApi {
  sendMessage(chatId: string, html: string, keyboard?: TelegramKeyboard): Promise<void>;
  /** Inline tugma bosilganda "yuklanmoqda" belgisini olib tashlaydi va ixtiyoriy qisqa xabar ko'rsatadi */
  answerCallbackQuery(id: string, text?: string, alert?: boolean): Promise<void>;
  /** Xabardagi inline tugmalarni olib tashlaydi (amal bajarilgach qayta bosilmasligi uchun) */
  clearKeyboard(chatId: string, messageId: number): Promise<void>;
  setWebhook(url: string, secret: string): Promise<void>;
  getUpdates(offset: number, timeoutSec: number, signal?: AbortSignal): Promise<TelegramUpdate[]>;
  deleteWebhook(): Promise<void>;
}

/**
 * Telegram Bot API (HTTPS). Token faqat so'rov manzilida ishlatiladi: xato xabarlari, jurnal va
 * istisnolarga yozilmaydi (URL hech qachon xatoga qo'shilmaydi).
 */
export class HttpTelegramApi implements TelegramApi {
  constructor(private readonly token: string, private readonly baseUrl = 'https://api.telegram.org') {}

  private async call<T>(method: string, body: Record<string, unknown>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
    const timeout = AbortSignal.timeout(timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch (e) {
      if (signal?.aborted) throw new Error(`Telegram ${method}: to'xtatildi`);
      throw new Error(`Telegram ${method}: tarmoq xatosi`);
    }
    const data: any = await res.json().catch(() => null);
    if (!data || data.ok !== true) throw new TelegramApiError(Number(data?.error_code ?? res.status), String(data?.description ?? 'noma\'lum xato').slice(0, 200));
    return data.result as T;
  }

  async sendMessage(chatId: string, html: string, keyboard?: TelegramKeyboard): Promise<void> {
    const body: Record<string, unknown> = { chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true };
    if (keyboard?.length) body.reply_markup = { inline_keyboard: keyboard.map((row) => row.map((b) => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.callback }))) };
    try {
      await this.call('sendMessage', body, 10_000);
    } catch (e) {
      // 429 (juda ko'p so'rov): Telegram aytgan kutish vaqtidan keyin bir marta qayta uriniladi
      if (e instanceof TelegramApiError && e.code === 429) {
        const wait = Math.min(Number(/retry after (\d+)/i.exec(e.description)?.[1] ?? 1), 5);
        await new Promise((r) => setTimeout(r, wait * 1000));
        await this.call('sendMessage', body, 10_000);
      } else throw e;
    }
  }

  async answerCallbackQuery(id: string, text?: string, alert = false): Promise<void> {
    await this.call('answerCallbackQuery', { callback_query_id: id, ...(text && { text: text.slice(0, 200), show_alert: alert }) }, 10_000);
  }

  async clearKeyboard(chatId: string, messageId: number): Promise<void> {
    await this.call('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }, 10_000);
  }

  async setWebhook(url: string, secret: string): Promise<void> {
    await this.call('setWebhook', { url, secret_token: secret, allowed_updates: ['message', 'callback_query'], drop_pending_updates: false }, 10_000);
  }

  getUpdates(offset: number, timeoutSec: number, signal?: AbortSignal): Promise<TelegramUpdate[]> {
    return this.call('getUpdates', { offset, timeout: timeoutSec, allowed_updates: ['message', 'callback_query'] }, (timeoutSec + 10) * 1000, signal);
  }

  async deleteWebhook(): Promise<void> {
    await this.call('deleteWebhook', { drop_pending_updates: false }, 10_000);
  }
}

export const escapeHtml = (s: unknown) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
