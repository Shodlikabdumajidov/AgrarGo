import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Token bo'lsa foydalanuvchini aniqlaydi; yo'q yoki yaroqsiz bo'lsa so'rovni mehmon sifatida o'tkazadi (401 bermaydi). */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<T = any>(_err: any, user: T): T {
    return (user || null) as T;
  }
}
