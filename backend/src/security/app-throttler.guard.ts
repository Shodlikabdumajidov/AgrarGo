import { ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';

export function formatWait(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  if (s < 60) return `${s} soniya`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m} daqiqa`;
  return `${Math.ceil(m / 60)} soat`;
}

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async throwThrottlingException(context: ExecutionContext, detail: ThrottlerLimitDetail): Promise<void> {
    const res = context.switchToHttp().getResponse();
    const wait = Math.max(1, detail.isBlocked ? detail.timeToBlockExpire : detail.timeToExpire);
    res.setHeader('Retry-After', String(wait));
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        message: `Juda ko'p urinish. ${formatWait(wait)}dan keyin qayta urinib ko'ring.`,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
