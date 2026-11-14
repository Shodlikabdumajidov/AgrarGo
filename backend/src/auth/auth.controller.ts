import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto, SendOtpDto, VerifyOtpDto, VerifyResetCodeDto } from './dto/password.dto';
import { RegisterDriverDto } from './dto/register-driver.dto';
import { RegisterFarmerDto } from './dto/register-farmer.dto';
import { RegisterConsumerDto } from './dto/register-consumer.dto';
import { RegisterMarketDto } from './dto/register-market.dto';
import { ThrottleProfile } from '../security/throttle-profile';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PasswordService } from './password/password.service';
import { PhoneOtpService } from './password/phone-otp.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly passwords: PasswordService, private readonly phoneOtp: PhoneOtpService) {}

  @Post('farmer/register')
  @ThrottleProfile('register')
  registerFarmer(@Body() dto: RegisterFarmerDto) {
    return this.auth.registerFarmer(dto);
  }

  @Post('driver/register')
  @ThrottleProfile('register')
  registerDriver(@Body() dto: RegisterDriverDto) {
    return this.auth.registerDriver(dto);
  }

  @Post('market/register')
  @ThrottleProfile('register')
  registerMarket(@Body() dto: RegisterMarketDto) {
    return this.auth.registerMarket(dto);
  }

  @Post('consumer/register')
  @ThrottleProfile('register')
  registerConsumer(@Body() dto: RegisterConsumerDto) {
    return this.auth.registerConsumer(dto);
  }

  @Post('login')
  @ThrottleProfile('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  /** Tizimga kirgan foydalanuvchi joriy parolini kiritib yangisiga almashtiradi. Boshqa qurilmalardagi tokenlar yopiladi. */
  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ThrottleProfile('pwchange')
  @HttpCode(200)
  changePassword(@CurrentUser() user: { id: string }, @Body() dto: ChangePasswordDto) {
    return this.passwords.changePassword(user.id, dto);
  }

  /**
   * Yagona SMS kod yuborish: purpose=REGISTER (ro'yxatdan o'tishda telefonni tasdiqlash) yoki RESET (parolni tiklash).
   * Simulyatsiya rejimida kod javobda `devCode` sifatida qaytadi (interfeys uni toast/modalda ko'rsatadi); RESET uchun production'da hech qachon.
   */
  @Post('send-otp')
  @ThrottleProfile('forgot')
  @HttpCode(200)
  sendOtp(@Body() dto: SendOtpDto) {
    return dto.purpose === 'REGISTER' ? this.phoneOtp.send(dto.phone) : this.passwords.forgotPassword(dto.phone);
  }

  /** Kodni tasdiqlaydi: REGISTER -> `otpToken` (ro'yxatdan o'tish so'roviga qo'shiladi), RESET -> `resetToken` (/auth/reset-password uchun). */
  @Post('verify-otp')
  @ThrottleProfile('verify')
  @HttpCode(200)
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    if (dto.purpose === 'REGISTER') return this.phoneOtp.verify(dto.phone, dto.code);
    return { verified: true, ...(await this.passwords.verifyResetCode(dto.phone, dto.code)) };
  }

  /** 1) Telefon raqamga SMS kod yuboriladi (raqam mavjudligidan qat'i nazar bir xil javob). */
  @Post('forgot-password')
  @ThrottleProfile('forgot')
  @HttpCode(200)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.passwords.forgotPassword(dto.phone);
  }

  /** 2) Kod tasdiqlanadi va bir martalik tiklash tokeni beriladi. */
  @Post('verify-reset-code')
  @ThrottleProfile('verify')
  @HttpCode(200)
  verifyResetCode(@Body() dto: VerifyResetCodeDto) {
    return this.passwords.verifyResetCode(dto.phone, dto.code);
  }

  /** 3) Token bilan yangi parol o'rnatiladi. */
  @Post('reset-password')
  @ThrottleProfile('reset')
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.passwords.resetPassword(dto.resetToken, dto.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: unknown) {
    return user;
  }
}
