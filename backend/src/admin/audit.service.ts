import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

export interface Actor { id: string; fullName: string; role: Role }

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Jurnalga yozish asosiy amalni to'xtatmaydi: yozilmasa ham xato ko'tarilmaydi (lekin loglanadi). */
  async log(actor: Actor, action: string, entity: string, entityId?: string | null, details?: Prisma.InputJsonValue) {
    try {
      await this.prisma.auditLog.create({
        data: { actorId: actor.id, actorName: actor.fullName, actorRole: actor.role, action, entity, entityId: entityId ?? null, details },
      });
    } catch (e) {
      console.error('[audit] yozib bo\'lmadi', e);
    }
  }
}

/** Ombor va to'lov kabi mavjud modullarda xodim/admin bajargan o'zgartiruvchi (POST/PATCH/DELETE) amallarni jurnalga yozadi. */
@Injectable()
export class StaffAuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as (Actor | undefined);
    const mutating = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method);
    if (!mutating || !user || (user.role !== Role.ADMIN && user.role !== Role.DISPATCHER)) return next.handle();
    return next.handle().pipe(
      tap(() => {
        const route = String(req.route?.path ?? req.path).replace(/^\//, '');
        const entity = route.split('/')[0] || 'system';
        const id = req.params?.id ?? req.params?.bookingId ?? null;
        void this.audit.log(user, `${req.method} /${route}`, entity, id, undefined);
      }),
    );
  }
}

/** Admin javoblari brauzer/proksida keshlanmasin (shaxsiy ma'lumotlar). */
@Injectable()
export class NoStoreInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    ctx.switchToHttp().getResponse().setHeader('Cache-Control', 'no-store');
    return next.handle();
  }
}
