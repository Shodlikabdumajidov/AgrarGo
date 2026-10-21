import { SetMetadata } from '@nestjs/common';
import { AdminRole } from '@prisma/client';

export const ADMIN_ROLES_KEY = 'adminRoles';

/**
 * Administrator ichki rollari (RBAC): shu endpoint/controller'ga qaysi administrator turlari kira oladi.
 * SUPER_ADMIN har doim kiradi. Dekorator yo'q bo'lsa — ADMIN endpointlariga faqat SUPER_ADMIN kiradi (xavfsiz standart).
 * Faqat @Roles(Role.ADMIN, ...) ruxsat bergan endpointlarda ishlaydi (RolesGuard tekshiradi).
 */
export const AdminRoles = (...roles: AdminRole[]) => SetMetadata(ADMIN_ROLES_KEY, roles);
