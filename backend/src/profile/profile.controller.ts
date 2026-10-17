import {
  Body, Controller, Delete, Get, Patch, Post, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { MAX_AVATAR_BYTES, ProfileService } from './profile.service';

// Har qanday tizimga kirgan foydalanuvchi (rolidan qat'i nazar) o'z profilini boshqaradi.
// Telefon raqam identifikator bo'lgani uchun bu yerda o'zgartirilmaydi.
@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  get(@CurrentUser() user: { id: string }) {
    return this.profile.get(user.id);
  }

  @Patch()
  update(@CurrentUser() user: { id: string; role: any }, @Body() body: unknown) {
    return this.profile.update(user.id, user.role, body);
  }

  @Post('avatar')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_AVATAR_BYTES, files: 1 } }))
  setAvatar(@CurrentUser() user: { id: string }, @UploadedFile() file?: Express.Multer.File) {
    return this.profile.setAvatar(user.id, file);
  }

  @Delete('avatar')
  removeAvatar(@CurrentUser() user: { id: string }) {
    return this.profile.removeAvatar(user.id);
  }
}
