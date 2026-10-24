import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { AdminRole, Role } from '@prisma/client';
import { AdminRoles } from '../common/admin-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { AdminReviewsQuery, SetApprovalDto } from '../reviews/dto/review.dto';
import { ReviewsService } from '../reviews/reviews.service';
import { SettingsService } from '../settings/settings.service';
import { UpdateSettingsDto } from '../settings/settings.dto';
import { AdminService } from './admin.service';
import { Actor, AuditService, NoStoreInterceptor } from './audit.service';
import {
  AuditQuery, CreateStaffDto, ProductsQuery, SetAdminRoleDto, SetPasswordDto, SetStatusDto, ShipmentsQuery, UpdateProductDto, UsersQuery,
} from './dto/admin.dto';

const uuid = new ParseUUIDPipe();

// Superuser: bu controllerdagi hamma narsa faqat ADMIN uchun. Omborxona va to'lovlarning mavjud endpointlari ham ADMIN'ga ochiq.
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@UseInterceptors(NoStoreInterceptor)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly reviews: ReviewsService,
  ) {}

  @Get('stats')
  @AdminRoles(AdminRole.SAFETY_ADMIN, AdminRole.FINANCE_ADMIN, AdminRole.HUB_ADMIN)
  stats() { return this.admin.stats(); }

  // ----- Foydalanuvchilar -----
  @Get('users')
  users(@Query() q: UsersQuery) { return this.admin.listUsers(q); }

  @Post('staff')
  createStaff(@CurrentUser() me: Actor, @Body() dto: CreateStaffDto) { return this.admin.createStaff(me, dto); }

  @Get('users/:id')
  user(@Param('id', uuid) id: string) { return this.admin.getUser(id); }

  @Patch('users/:id')
  updateUser(@CurrentUser() me: Actor, @Param('id', uuid) id: string, @Body() body: unknown) { return this.admin.updateUser(me, id, body); }

  @Patch('users/:id/status')
  setStatus(@CurrentUser() me: Actor, @Param('id', uuid) id: string, @Body() dto: SetStatusDto) {
    return this.admin.setStatus(me, id, dto.isActive, dto.reason);
  }

  @Patch('users/:id/admin-role')
  setAdminRole(@CurrentUser() me: Actor, @Param('id', uuid) id: string, @Body() dto: SetAdminRoleDto) {
    return this.admin.setAdminRole(me, id, dto.adminRole);
  }

  @Post('users/:id/password')
  @HttpCode(200)
  setPassword(@CurrentUser() me: Actor, @Param('id', uuid) id: string, @Body() dto: SetPasswordDto) {
    return this.admin.setPassword(me, id, dto.password);
  }

  // ----- E'lonlar -----
  @Get('products')
  products(@Query() q: ProductsQuery) { return this.admin.listProducts(q); }

  @Patch('products/:id')
  updateProduct(@CurrentUser() me: Actor, @Param('id', uuid) id: string, @Body() dto: UpdateProductDto) { return this.admin.updateProduct(me, id, dto); }

  @Delete('products/:id')
  deleteProduct(@CurrentUser() me: Actor, @Param('id', uuid) id: string) { return this.admin.deleteProduct(me, id); }

  // ----- Yuk tashish -----
  @Get('shipments')
  shipments(@Query() q: ShipmentsQuery) { return this.admin.listShipments(q); }

  // ----- Sayt sozlamalari -----
  @Get('settings')
  getSettings() { return this.settings.getForAdmin(); }

  @Put('settings')
  async putSettings(@CurrentUser() me: Actor, @Body() dto: UpdateSettingsDto) {
    const { row, before } = await this.settings.update(me.id, dto);
    const changed = (Object.keys(dto) as (keyof UpdateSettingsDto)[]).filter((k) => JSON.stringify((before as any)[k]) !== JSON.stringify((row as any)[k]));
    await this.audit.log(me, 'settings.update', 'settings', '1', { changed });
    return row;
  }

  // ----- Sharhlar (moderatsiya) -----
  @Get('reviews')
  listReviews(@Query() q: AdminReviewsQuery) { return this.reviews.adminList(q); }

  @Patch('reviews/:id')
  async setReview(@CurrentUser() me: Actor, @Param('id', uuid) id: string, @Body() dto: SetApprovalDto) {
    const r = await this.reviews.adminSetApproval(id, dto.isApproved);
    await this.audit.log(me, dto.isApproved ? 'review.approve' : 'review.hide', 'review', id);
    return r;
  }

  @Delete('reviews/:id')
  async deleteReview(@CurrentUser() me: Actor, @Param('id', uuid) id: string) {
    const r = await this.reviews.adminDelete(id);
    await this.audit.log(me, 'review.delete', 'review', id);
    return r;
  }

  // ----- Audit jurnali -----
  @Get('audit')
  auditLog(@Query() q: AuditQuery) { return this.admin.listAudit(q); }
}
