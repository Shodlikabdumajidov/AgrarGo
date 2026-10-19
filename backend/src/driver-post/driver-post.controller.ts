import { Body, Controller, Delete, ForbiddenException, Get, Header, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ThrottleProfile } from '../security/throttle-profile';
import { SubscriptionGuard } from '../subscription/subscription.guard';
import { CreateDriverPostDto, ListDriverPostsQuery, UpdateDriverPostDto } from './dto/driver-post.dto';
import { DriverPostService, MAX_POST_PHOTO_BYTES } from './driver-post.service';

/** Haydovchi xizmat e'lonlari katalogi: ko'rish — barcha kirgan foydalanuvchilar; yaratish/tahrirlash — egasi haydovchi */
@Controller('driver-posts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DriverPostController {
  constructor(private readonly posts: DriverPostService) {}

  @Get()
  list(@Query() query: ListDriverPostsQuery) {
    return this.posts.list(query);
  }

  @Get('mine')
  @Roles(Role.DRIVER)
  mine(@CurrentUser() user: any) {
    return this.posts.mine(this.driverId(user));
  }

  @Post()
  @UseGuards(SubscriptionGuard)
  @Roles(Role.DRIVER)
  create(@CurrentUser() user: any, @Body() dto: CreateDriverPostDto) {
    return this.posts.create(this.driverId(user), dto);
  }

  @Patch(':id')
  @Roles(Role.DRIVER, Role.ADMIN)
  update(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDriverPostDto) {
    return this.posts.update(id, user.role === Role.ADMIN ? null : this.driverId(user), dto);
  }

  @Delete(':id')
  @Roles(Role.DRIVER, Role.ADMIN)
  remove(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.posts.remove(id, user.role === Role.ADMIN ? null : this.driverId(user));
  }

  @Post(':id/photos')
  @ThrottleProfile('upload')
  @Roles(Role.DRIVER)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_POST_PHOTO_BYTES, files: 1 } }))
  addPhoto(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: Express.Multer.File) {
    return this.posts.addPhoto(id, this.driverId(user), file);
  }

  @Delete(':id/photos/:index')
  @Roles(Role.DRIVER)
  removePhoto(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Param('index', ParseIntPipe) index: number) {
    return this.posts.removePhoto(id, this.driverId(user), index);
  }

  @Get(':id/contact')
  @Roles(Role.FARMER, Role.MARKET, Role.DISPATCHER, Role.ADMIN)
  @Header('Cache-Control', 'no-store')
  contact(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.posts.contact(id, user.role);
  }

  private driverId(user: { driver?: { id: string } | null }) {
    if (!user.driver) throw new ForbiddenException('Haydovchi profili topilmadi');
    return user.driver.id;
  }
}
