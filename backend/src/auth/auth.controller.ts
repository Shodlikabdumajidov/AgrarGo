import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDriverDto } from './dto/register-driver.dto';
import { RegisterFarmerDto } from './dto/register-farmer.dto';
import { RegisterMarketDto } from './dto/register-market.dto';
import { ThrottleProfile } from '../security/throttle-profile';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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

  @Post('login')
  @ThrottleProfile('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: unknown) {
    return user;
  }
}
