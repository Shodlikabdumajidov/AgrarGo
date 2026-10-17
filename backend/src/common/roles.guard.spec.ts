import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';

const ctx = (user: unknown): ExecutionContext =>
  ({
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

const guardFor = (required: Role[] | undefined) => {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(required) } as unknown as Reflector;
  return new RolesGuard(reflector);
};

describe('RolesGuard', () => {
  it("rol talab qilinmasa o'tkazadi", () => {
    expect(guardFor(undefined).canActivate(ctx({ role: Role.DRIVER }))).toBe(true);
    expect(guardFor([]).canActivate(ctx(undefined))).toBe(true);
  });

  it("mos rolni o'tkazadi", () => {
    expect(guardFor([Role.FARMER]).canActivate(ctx({ role: Role.FARMER }))).toBe(true);
    expect(guardFor([Role.DRIVER, Role.FARMER]).canActivate(ctx({ role: Role.FARMER }))).toBe(true);
  });

  it("boshqa rolni 403 bilan rad etadi", () => {
    expect(() => guardFor([Role.FARMER]).canActivate(ctx({ role: Role.MARKET }))).toThrow(ForbiddenException);
  });

  it("foydalanuvchi yo'q bo'lsa rad etadi", () => {
    expect(() => guardFor([Role.FARMER]).canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });
});
