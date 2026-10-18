export const TELEGRAM_API = 'TELEGRAM_API_ADAPTER';

export interface TelegramUpdate {
  update_id: number;
  message?: { text?: string; chat: { id: number; type: string } };
}

/** Telegram Bot API xatosi (error_code: 403 = bot bloklangan, 409 = webhook/boshqa polling bilan to'qnashuv va h.k.). */
export class TelegramApiError extends Error {
  constructor(readonly code: number, readonly description: string) {
    super(`Telegram API ${code}: ${description}`);
  }
}

/** Bot bilan ishlash adapteri: testlarda soxta amalga oshirish beriladi, production'da HTTP. */
export interface TelegramApi {
  sendMessage(chatId: string, html: string): Promise<void>;
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

  async sendMessage(chatId: string, html: string): Promise<void> {
    await this.call('sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true }, 10_000);
  }

  getUpdates(offset: number, timeoutSec: number, signal?: AbortSignal): Promise<TelegramUpdate[]> {
    return this.call('getUpdates', { offset, timeout: timeoutSec, allowed_updates: ['message'] }, (timeoutSec + 10) * 1000, signal);
  }

  async deleteWebhook(): Promise<void> {
    await this.call('deleteWebhook', { drop_pending_updates: false }, 10_000);
  }
}

export const escapeHtml = (s: unknown) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
