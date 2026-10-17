import { Role } from '@prisma/client';

export const ROLE_LABEL: Record<Role, string> = {
  FARMER: 'Fermer',
  DRIVER: 'Haydovchi',
  MARKET: 'Market',
  ADMIN: 'Admin',
};

// Bitta telefon raqam faqat bitta rolda bo'la oladi
export const roleTakenMessage = (role: Role) =>
  `Ushbu raqam allaqachon ${ROLE_LABEL[role]} sifatida ro'yxatdan o'tgan`;
