import { ConflictException, ForbiddenException, HttpException, Inject, Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Role } from '@prisma/client';
import { BookingService } from '../booking/booking.service';
import { OfferService } from '../booking/offer.service';
import { ComplaintService } from '../complaint/complaint.service';
import { PrismaService } from '../prisma/prisma.service';
import { APP_ENV } from '../config/app-env.module';
import { AppEnv } from '../config/env.validation';
import { escapeHtml, TELEGRAM_API, TelegramApi, TelegramApiError, TelegramCallbackQuery, TelegramUpdate } from './telegram-api';
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
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  onApplicationBootstrap() {
    if (this.api && this.env.TELEGRAM_WEBHOOK_URL) {
      // Webhook rejimi: polling yo'q; Telegram yangilanishlarni POST /telegram/webhook ga yuboradi
      this.api.setWebhook(this.env.TELEGRAM_WEBHOOK_URL, this.env.TELEGRAM_WEBHOOK_SECRET)
        .then(() => this.logger.log('Telegram webhook o\'rnatildi'))
        .catch((e) => this.logger.warn(`setWebhook: ${e.message}`));
      return;
    }
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
    if (u.callback_query) return this.handleCallback(u.callback_query);
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

  // ---------- Inline tugmalar (tezkor amallar) ----------

  /**
   * callback_data: `<amal>:<qaror>:<id>`
   *   bk:a|r  — fermer: bronni tasdiqlash / rad etish
   *   of:a|r  — fermer: narx taklifini tasdiqlash / rad etish
   *   oc:a|r  — market: fermerning qarshi taklifini qabul qilish / rad etish
   *   cp:u|p|r — dispetcher/admin: shikoyat qarori (to'liq asosli / qisman / asossiz)
   * Amal faqat shu chat ulangan faol foydalanuvchi nomidan va xizmatlarning o'z huquq tekshiruvlari bilan bajariladi.
   */
  async handleCallback(q: TelegramCallbackQuery): Promise<void> {
    const api = this.api;
    if (!api) return;
    const answer = (text: string, alert = true) => api.answerCallbackQuery(q.id, text, alert).catch((e) => this.logger.warn(`answerCallback: ${e.message}`));
    const chat = q.message?.chat;
    const m = /^(bk|of|oc|cp):([a-z]):([0-9a-f-]{36})$/.exec(q.data ?? '');
    if (!chat || chat.type !== 'private' || !m) return void (await answer("Noma'lum amal"));
    const chatId = String(chat.id);
    const user = await this.prisma.user.findFirst({ where: { telegramChatId: chatId, isActive: true }, include: { farmer: true, market: true } });
    if (!user) return void (await answer("Bu chat AgrarGo akkauntiga ulanmagan. Profil → Telegram botni ulash."));
    const [, kind, act, id] = m;
    try {
      let done = '';
      if (kind === 'bk' && user.farmer) {
        const bookings = this.moduleRef.get(BookingService, { strict: false });
        if (act === 'a') { await bookings.approve(user.farmer.id, id); done = '✅ Bron tasdiqlandi'; }
        else { await bookings.reject(user.farmer.id, id); done = '❌ Bron rad etildi'; }
      } else if (kind === 'of' && user.farmer) {
        const offers = this.moduleRef.get(OfferService, { strict: false });
        if (act === 'a') { await offers.farmerAccept(user.farmer.id, id); done = '✅ Taklif tasdiqlandi: bron yaratildi'; }
        else { await offers.farmerReject(user.farmer.id, id); done = '❌ Taklif rad etildi'; }
      } else if (kind === 'oc' && user.market) {
        const offers = this.moduleRef.get(OfferService, { strict: false });
        if (act === 'a') { await offers.marketAcceptCounter(user.market.id, id); done = '✅ Qarshi taklif qabul qilindi: bron yaratildi'; }
        else { await offers.marketCancel(user.market.id, id); done = '❌ Taklif bekor qilindi'; }
      } else if (kind === 'cp' && (user.role === Role.DISPATCHER || (user.role === Role.ADMIN && ['SUPER_ADMIN', 'SAFETY_ADMIN'].includes(user.adminRole)))) {
        const complaints = this.moduleRef.get(ComplaintService, { strict: false });
        const decision = act === 'u' ? 'UPHELD' : act === 'p' ? 'PARTIAL' : 'REJECTED';
        await complaints.decide({ id: user.id, role: user.role }, id, decision);
        done = decision === 'UPHELD' ? "✅ To'liq asosli: +1 ★" : decision === 'PARTIAL' ? '✅ Qisman asosli: +0.5 ★' : '✅ Asossiz: rad etildi';
      } else throw new ForbiddenException("Bu amal sizning rolingiz uchun emas");
      if (q.message) await api.clearKeyboard(chatId, q.message.message_id).catch(() => undefined);
      await answer(done, false);
      await this.reply(chatId, `<b>${escapeHtml(done)}</b>`);
    } catch (e: any) {
      // Biznes qoidasi xatosi (allaqachon ko'rib chiqilgan, topilmadi va h.k.) foydalanuvchiga qisqa ko'rsatiladi; boshqa xatolar jurnalga
      const msg = e instanceof HttpException ? String((e.getResponse() as any)?.message ?? e.message) : null;
      if (!msg) this.logger.warn(`callback ${q.data}: ${e?.message}`);
      if (e instanceof ConflictException || e instanceof NotFoundException) if (q.message) await api.clearKeyboard(chatId, q.message.message_id).catch(() => undefined);
      await answer((msg ?? 'Xatolik yuz berdi. Keyinroq urinib ko\'ring.').slice(0, 190));
    }
  }

  private async reply(chatId: string, html: string) {
    await this.api!.sendMessage(chatId, html).catch((e) => this.logger.warn(`reply: ${e.message}`));
  }
}
