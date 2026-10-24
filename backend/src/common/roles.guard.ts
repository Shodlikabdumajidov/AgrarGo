import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminRole, Role } from '@prisma/client';
import { ADMIN_ROLES_KEY } from './admin-roles.decorator';
import { ROLES_KEY } from './roles.decorator';

// JwtAuthGuard'dan KEYIN ishlaydi: req.user allaqachon to'ldirilgan bo'ladi
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest().user;
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException("Bu amal uchun sizda ruxsat yo'q");
    }
    // RBAC: administrator ichki roli. SUPER_ADMIN hamma narsaga kiradi; boshqalar faqat @AdminRoles() da ko'rsatilgan joylarga.
    if (user.role === Role.ADMIN && user.adminRole !== AdminRole.SUPER_ADMIN) {
      const allowed = this.reflector.getAllAndOverride<AdminRole[]>(ADMIN_ROLES_KEY, [context.getHandler(), context.getClass()]);
      if (!allowed || !allowed.includes(user.adminRole)) throw new ForbiddenException("Bu bo'lim sizning administrator rolingiz uchun yopiq");
    }
    return true;
  }
}
