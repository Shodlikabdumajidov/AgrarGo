import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { APP_ENV } from '../config/app-env.module';
import { AppEnv } from '../config/env.validation';
import { escapeHtml, TELEGRAM_API, TelegramApi, TelegramApiError, TelegramUpdate } from './telegram-api';
import { TelegramService } from './telegram.service';

const HELP =
  "🌾 <b>AgrarGo botiga xush kelibsiz!</b>\n\nXabarnomalarni olish uchun saytdagi <b>Profil → Telegram botni ulash</b> tugmasini bosing va chiqqan havola orqali botga qaytib keling.\n\n"
  + "/unlink — akkauntni bu chatdan uzish\n/help — yordam";

/** Bot buyruqlari: `/start <token>`, `/unlink`, `/help`. Faqat shaxsiy (private) chatlar. */
@Injectable()
export class TelegramBotService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('TelegramBot');
  private running = false;
  private abort = new AbortController();
  private loopDone: Promise<void> = Promise.resolve();

  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    @Inject(TELEGRAM_API) private readonly api: TelegramApi | null,
    private readonly telegram: TelegramService,
  ) {}

  onApplicationBootstrap() {
    if (!this.api || !this.env.TELEGRAM_POLLING) return;
    this.running = true;
    this.loopDone = this.loop();
    this.logger.log('Telegram bot ishga tushdi (long polling)');
  }

  async onModuleDestroy() {
    this.running = false;
    this.abort.abort();
    await this.loopDone;
  }

  private async loop() {
    const api = this.api!;
    let offset = 0;
    let backoff = 1000;
    // Webhook o'rnatilgan bo'lsa getUpdates 409 qaytaradi: polling rejimiga o'tishdan oldin olib tashlanadi
    await api.deleteWebhook().catch((e) => this.logger.warn(`deleteWebhook: ${e.message}`));
    while (this.running) {
      try {
        const updates = await api.getUpdates(offset, 25, this.abort.signal);
        backoff = 1000;
        for (const u of updates) {
          offset = Math.max(offset, u.update_id + 1);
          await this.handleUpdate(u).catch((e) => this.logger.warn(`update ${u.update_id}: ${e.message}`));
        }
      } catch (e: any) {
        if (!this.running) break;
        this.logger.warn(e instanceof TelegramApiError && e.code === 409
          ? 'Telegram 409: boshqa nusxa ham polling qilmoqda (TELEGRAM_POLLING ni bittasida qoldiring)'
          : String(e.message ?? e));
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, 30_000);
      }
    }
  }

  async handleUpdate(u: TelegramUpdate): Promise<void> {
    const m = u.message;
    if (!m?.text || m.chat.type !== 'private' || !this.api) return;
    const chatId = String(m.chat.id);
    const match = /^\/([A-Za-z_]+)(?:@\w+)?(?:\s+(\S+))?\s*$/.exec(m.text.trim().slice(0, 200));
    if (!match) return this.reply(chatId, HELP);
    const [, cmd, arg] = match;
    switch (cmd.toLowerCase()) {
      case 'start': {
        if (!arg) return this.reply(chatId, HELP);
        const r = await this.telegram.linkByToken(chatId, arg);
        if (r.status === 'linked') {
          return this.reply(chatId, `✅ <b>Ulandi!</b>\n${escapeHtml(r.fullName)}, endi bron, to'lov va yuk holati haqidagi xabarlar shu yerga keladi.\n\nUzish: /unlink`);
        }
        if (r.status === 'chat_taken') return this.reply(chatId, "⚠️ Bu Telegram boshqa AgrarGo akkauntiga ulangan. Avval o'sha akkauntdan uzing (/unlink).");
        return this.reply(chatId, "❌ Havola yaroqsiz yoki muddati o'tgan. Saytdagi Profil bo'limidan yangi havola oling.");
      }
      case 'unlink':
      case 'stop':
        return this.reply(chatId, (await this.telegram.unlinkByChat(chatId)) ? '🔕 Akkaunt uzildi. Xabarnomalar kelmaydi.' : "Bu chat hech qanday akkauntga ulanmagan.");
      default:
        return this.reply(chatId, HELP);
    }
  }

  private async reply(chatId: string, html: string) {
    await this.api!.sendMessage(chatId, html).catch((e) => this.logger.warn(`reply: ${e.message}`));
  }
}
