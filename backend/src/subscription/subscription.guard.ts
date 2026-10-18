import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { computeSubscription } from './subscription.logic';

/**
 * Asosiy funksiyalarni (e'lon berish, yuk bron qilish, yukni qabul qilish) sinov/obuna tugaganda bloklaydi.
 * JwtAuthGuard'dan KEYIN ishlaydi (req.user to'ldirilgan). 402 Payment Required + `code` — frontend to'lov sahifasiga yo'naltiradi.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user;
    if (!user) return true; // autentifikatsiyani boshqa guard hal qiladi
    const info = computeSubscription(user);
    if (info.hasAccess) return true;
    throw new HttpException(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        code: 'SUBSCRIPTION_REQUIRED',
        message: "Bepul sinov muddati tugadi. Davom etish uchun obunani uzaytiring",
        error: 'Payment Required',
        priceUzs: info.priceUzs,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
