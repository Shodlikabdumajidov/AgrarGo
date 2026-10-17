import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { roleTakenMessage, ROLE_LABEL } from '../common/role-labels';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterBaseDto } from './dto/register-base.dto';
import { RegisterDriverDto } from './dto/register-driver.dto';
import { RegisterFarmerDto } from './dto/register-farmer.dto';
import { RegisterMarketDto } from './dto/register-market.dto';

// Foydalanuvchi topilmaganda ham bcrypt solishtirilishi uchun: javob vaqti orqali raqam mavjudligi bilinmasin
const TIMING_DUMMY_HASH = bcrypt.hashSync('timing-protection-dummy', 10);

export const USER_WITH_PROFILES = { farmer: true, driver: true, market: true } as const;

type RoleProfile = Pick<Prisma.UserCreateInput, 'farmer' | 'driver' | 'market'>;

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  registerFarmer(dto: RegisterFarmerDto) {
    const { phone, password, fullName, ...farm } = dto;
    return this.register(Role.FARMER, dto, { farmer: { create: farm } });
  }

  registerDriver(dto: RegisterDriverDto) {
    const { phone, password, fullName, plateNumber, ...driver } = dto;
    return this.register(Role.DRIVER, dto, {
      driver: { create: { ...driver, plateNumber: plateNumber.replace(/[\s-]/g, '').toUpperCase() } },
    });
  }

  registerMarket(dto: RegisterMarketDto) {
    const { phone, password, fullName, ...market } = dto;
    return this.register(Role.MARKET, dto, { market: { create: market } });
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
      include: USER_WITH_PROFILES,
    });
    // Telefon yoki parol xato bo'lsa bir xil xabar va bir xil sarflangan vaqt (foydalanuvchi mavjudligini oshkor qilmaslik uchun)
    const passwordMatches = await bcrypt.compare(dto.password, user?.passwordHash ?? TIMING_DUMMY_HASH);
    if (!user || !user.isActive || !passwordMatches) throw new UnauthorizedException("Telefon raqam yoki parol noto'g'ri");

    // Parol to'g'ri, lekin raqam boshqa rolda: bitta raqam — bitta rol
    if (dto.role && user.role !== dto.role) {
      throw new ConflictException(
        `${roleTakenMessage(user.role)}. ${ROLE_LABEL[dto.role]} sifatida kirib bo'lmaydi`,
      );
    }
    return this.buildResponse(user);
  }

  private async register(role: Role, base: RegisterBaseDto, profile: RoleProfile) {
    const existing = await this.prisma.user.findUnique({
      where: { phone: base.phone },
      select: { role: true },
    });
    if (existing) throw new ConflictException(roleTakenMessage(existing.role));

    const passwordHash = await bcrypt.hash(base.password, 10);
    try {
      const user = await this.prisma.user.create({
        data: { phone: base.phone, passwordHash, fullName: base.fullName, role, ...profile },
        include: USER_WITH_PROFILES,
      });
      return this.buildResponse(user);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const target = String(e.meta?.target ?? '');
        if (target.includes('stir')) throw new ConflictException("Bu STIR allaqachon ro'yxatdan o'tgan");
        if (target.includes('plateNumber')) throw new ConflictException("Bu davlat raqami allaqachon ro'yxatdan o'tgan");
        // Bir vaqtda ikki marta yuborilgan so'rov (poyga holati)
        const again = await this.prisma.user.findUnique({ where: { phone: base.phone }, select: { role: true } });
        throw new ConflictException(again ? roleTakenMessage(again.role) : "Bu telefon raqam allaqachon ro'yxatdan o'tgan");
      }
      throw e;
    }
  }

  private buildResponse(user: Prisma.UserGetPayload<{ include: typeof USER_WITH_PROFILES }>) {
    const { passwordHash, ...safe } = user;
    const accessToken = this.jwt.sign({ sub: user.id, role: user.role });
    return { accessToken, user: safe };
  }
}
