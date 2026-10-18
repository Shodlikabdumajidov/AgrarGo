import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { StaffAuditInterceptor } from '../admin/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ThrottleProfile } from '../security/throttle-profile';
import { KycService, MAX_KYC_BYTES } from './kyc.service';

class RejectDto {
  @IsString() @MinLength(3, { message: 'Sababni yozing' }) @MaxLength(300)
  reason: string;
}

@Controller('kyc')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(StaffAuditInterceptor)
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @Get()
  status(@CurrentUser() user: { id: string }) {
    return this.kyc.status(user.id);
  }

  @Get('pending')
  @Roles(Role.ADMIN)
  pending() {
    return this.kyc.pending();
  }

  @Post('documents/:type')
  @Roles(Role.DRIVER)
  @ThrottleProfile('upload')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_KYC_BYTES, files: 1 } }))
  upload(@CurrentUser() user: { id: string; role: Role }, @Param('type') type: string, @UploadedFile() file?: Express.Multer.File) {
    return this.kyc.upload(user, this.kyc.parseType(type), file);
  }

  /** O'z hujjatim (ko'rish uchun) */
  @Get('documents/:type')
  @Roles(Role.DRIVER)
  async mine(@CurrentUser() user: { id: string; role: Role }, @Param('type') type: string, @Res() res: Response) {
    return this.send(res, await this.kyc.file(user, user.id, this.kyc.parseType(type)));
  }

  @Get(':userId/documents/:type')
  @Roles(Role.ADMIN)
  async ofUser(@CurrentUser() user: { id: string; role: Role }, @Param('userId', ParseUUIDPipe) userId: string, @Param('type') type: string, @Res() res: Response) {
    return this.send(res, await this.kyc.file(user, userId, this.kyc.parseType(type)));
  }

  @Post(':userId/approve')
  @HttpCode(200)
  @Roles(Role.ADMIN)
  approve(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.kyc.approve(userId);
  }

  @Post(':userId/reject')
  @HttpCode(200)
  @Roles(Role.ADMIN)
  reject(@Param('userId', ParseUUIDPipe) userId: string, @Body() dto: RejectDto) {
    return this.kyc.reject(userId, dto.reason);
  }

  @Post(':userId/revoke')
  @HttpCode(200)
  @Roles(Role.ADMIN)
  revoke(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.kyc.revoke(userId);
  }

  private send(res: Response, f: { stream: NodeJS.ReadableStream; mime: string }) {
    res.set({ 'Content-Type': f.mime, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' });
    (f.stream as any).pipe(res);
  }
}
