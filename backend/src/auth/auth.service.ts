import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterFarmerDto } from './dto/register-farmer.dto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async registerFarmer(dto: RegisterFarmerDto) {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    try {
      const user = await this.prisma.user.create({
        data: {
          phone: dto.phone,
          passwordHash,
          fullName: dto.fullName,
          role: Role.FARMER,
          farmer: {
            create: {
              farmName: dto.farmName,
              region: dto.region,
              district: dto.district,
              address: dto.address,
              latitude: dto.latitude,
              longitude: dto.longitude,
              stir: dto.stir,
            },
          },
        },
        include: { farmer: true },
      });
      return this.buildResponse(user);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const target = String(e.meta?.target ?? '');
        throw new ConflictException(
          target.includes('stir')
            ? "Bu STIR allaqachon ro'yxatdan o'tgan"
            : "Bu telefon raqam allaqachon ro'yxatdan o'tgan",
        );
      }
      throw e;
    }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
      include: { farmer: true },
    });
    // Telefon yoki parol xato bo'lsa bir xil xabar (foydalanuvchi mavjudligini oshkor qilmaslik uchun)
    const ok = user && user.isActive && (await bcrypt.compare(dto.password, user.passwordHash));
    if (!user || !ok) throw new UnauthorizedException("Telefon raqam yoki parol noto'g'ri");
    return this.buildResponse(user);
  }

  private buildResponse(user: User & { farmer?: unknown }) {
    const { passwordHash, ...safe } = user;
    const accessToken = this.jwt.sign({ sub: user.id, role: user.role });
    return { accessToken, user: safe };
  }
}
