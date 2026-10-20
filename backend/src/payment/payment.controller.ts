import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { Role } from '@prisma/client';
import { StaffAuditInterceptor } from '../admin/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ThrottleProfile } from '../security/throttle-profile';
import { InitPaymentDto, ListPaymentsQuery, RefundPaymentDto, ReleasePaymentDto } from './dto/payment.dto';
import { PaymentService, PaymentUser } from './payment.service';

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(StaffAuditInterceptor)
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  /** Xaridor to'lovni boshlaydi (hozir simulyatsiya): mablag' escrow'da ushlab turiladi. */
  @Post('init')
  @HttpCode(200)
  @ThrottleProfile('payment')
  @Roles(Role.MARKET)
  init(@CurrentUser() user: PaymentUser, @Body() dto: InitPaymentDto) {
    return this.payments.init(user, dto.bookingId, !!dto.useCashback);
  }

  /** Yuk yetkazilgach pulni fermerga chiqarish (xaridor tasdig'i, muddat o'tgach fermer, yoki administrator). */
  @Post('release')
  @HttpCode(200)
  @ThrottleProfile('payment')
  @Roles(Role.MARKET, Role.FARMER, Role.ADMIN)
  release(@CurrentUser() user: PaymentUser, @Body() dto: ReleasePaymentDto) {
    return this.payments.release(user, dto.bookingId);
  }

  /** Buyurtmani bekor qilib pulni xaridorga qaytarish (to'lanmagan bo'lsa shunchaki bekor qilish). */
  @Post('refund')
  @HttpCode(200)
  @ThrottleProfile('payment')
  @Roles(Role.MARKET, Role.FARMER, Role.ADMIN)
  refund(@CurrentUser() user: PaymentUser, @Body() dto: RefundPaymentDto) {
    return this.payments.refund(user, dto.bookingId, dto.reason);
  }

  /** O'z to'lovlari va tranzaksiyalar tarixi (administrator uchun hammasi). */
  @Get()
  @Roles(Role.MARKET, Role.FARMER, Role.ADMIN)
  list(@CurrentUser() user: PaymentUser, @Query() query: ListPaymentsQuery) {
    return this.payments.list(user, query);
  }

  @Get('booking/:bookingId')
  @Roles(Role.MARKET, Role.FARMER, Role.ADMIN)
  byBooking(@CurrentUser() user: PaymentUser, @Param('bookingId', ParseUUIDPipe) bookingId: string) {
    return this.payments.getByBooking(user, bookingId);
  }
}
