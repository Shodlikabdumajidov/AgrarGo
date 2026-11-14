import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { APP_ENV } from '../config/app-env.module';
import { AppEnv } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { TELEGRAM_API, TelegramApi } from './telegram-api';

export const hashLinkToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const LINK_TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/; // Telegram start parametri: A-Z a-z 0-9 _ -, 64 belgigacha

export type LinkResult =
  | { status: 'linked'; fullName: string }
  | { status: 'invalid' }      // token noto'g'ri, ishlatilgan yoki muddati o'tgan
  | { status: 'chat_taken' };  // bu Telegram boshqa akkauntga ulangan

/** Foydalanuvchi akkauntini Telegram chat bilan bog'lash (bir martalik token orqali). */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger('Telegram');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_ENV) private readonly env: AppEnv,
    @Inject(TELEGRAM_API) private readonly api: TelegramApi | null,
  ) {}

  get enabled() {
    return !!this.api;
  }

  async status(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { telegramChatId: true, telegramLinkedAt: true } });
    return { enabled: this.enabled, linked: !!u?.telegramChatId, linkedAt: u?.telegramChatId ? u.telegramLinkedAt : null, botUsername: this.env.TELEGRAM_BOT_USERNAME };
  }

  /** Yangi bir martalik token: avvalgisi bekor bo'ladi. Bazada faqat xeshi saqlanadi. */
  async createLinkToken(userId: string) {
    if (!this.enabled) throw new ServiceUnavailableException('Telegram bot hozircha sozlanmagan');
    const token = randomBytes(24).toString('base64url'); // 32 belgi, 192 bit entropiya
    const expiresAt = new Date(Date.now() + this.env.TELEGRAM_LINK_TTL_SECONDS * 1000);
    await this.prisma.user.update({ where: { id: userId }, data: { telegramAuthToken: hashLinkToken(token), telegramAuthTokenExpiresAt: expiresAt } });
    return { token, url: `https://t.me/${this.env.TELEGRAM_BOT_USERNAME}?start=${token}`, expiresAt };
  }

  async unlink(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { telegramChatId: true } });
    await this.prisma.user.update({
      where: { id: userId },
      data: { telegramChatId: null, telegramLinkedAt: null, telegramAuthToken: null, telegramAuthTokenExpiresAt: null },
    });
    if (u?.telegramChatId && this.api) {
      await this.api.sendMessage(u.telegramChatId, "🔕 AgrarGo akkauntingiz bu chatdan uzildi. Xabarnomalar endi kelmaydi.").catch(() => undefined);
    }
    return this.status(userId);
  }

  /** Bot: `/start <token>`. Token bir martalik: muvaffaqiyatli ishlatilgach o'chiriladi. */
  async linkByToken(chatId: string, token: string): Promise<LinkResult> {
    if (!LINK_TOKEN_RE.test(token)) return { status: 'invalid' };
    const hash = hashLinkToken(token);
    const now = new Date();
    const user = await this.prisma.user.findFirst({
      where: { telegramAuthToken: hash, telegramAuthTokenExpiresAt: { gt: now }, isActive: true },
      select: { id: true, fullName: true },
    });
    if (!user) return { status: 'invalid' };
    const other = await this.prisma.user.findUnique({ where: { telegramChatId: chatId }, select: { id: true } });
    if (other && other.id !== user.id) return { status: 'chat_taken' };
    try {
      // Atomik "egallash": parallel ikki /start dan faqat biri tokenni ishlata oladi
      const claimed = await this.prisma.user.updateMany({
        where: { id: user.id, telegramAuthToken: hash, telegramAuthTokenExpiresAt: { gt: now } },
        data: { telegramChatId: chatId, telegramLinkedAt: now, telegramAuthToken: null, telegramAuthTokenExpiresAt: null },
      });
      return claimed.count === 1 ? { status: 'linked', fullName: user.fullName } : { status: 'invalid' };
    } catch (e: any) {
      if (e?.code === 'P2002') return { status: 'chat_taken' }; // parallel boshqa akkaunt shu chatni oldi
      throw e;
    }
  }

  /** Bot: `/unlink`. Chat bog'langan akkauntni topib uzadi. */
  async unlinkByChat(chatId: string): Promise<boolean> {
    const r = await this.prisma.user.updateMany({
      where: { telegramChatId: chatId },
      data: { telegramChatId: null, telegramLinkedAt: null, telegramAuthToken: null, telegramAuthTokenExpiresAt: null },
    });
    return r.count > 0;
  }
}
