/**
 * Foydalanuvchini mijozga qaytarishdan oldin maxfiy maydonlarni olib tashlaydi:
 * parol xeshi, Telegram chat ID va bog'lash tokeni (xesh). Faqat `telegramLinked` belgisi ko'rinadi.
 */
export function publicUser<T extends {
  passwordHash?: string; telegramChatId?: string | null; telegramAuthToken?: string | null;
  telegramAuthTokenExpiresAt?: Date | null; telegramLinkedAt?: Date | null;
}>(user: T) {
  const { passwordHash, telegramChatId, telegramAuthToken, telegramAuthTokenExpiresAt, telegramLinkedAt, ...safe } = user;
  return { ...safe, telegramLinked: !!telegramChatId };
}
