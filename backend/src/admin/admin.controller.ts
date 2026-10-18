import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { SettingsService } from '../settings/settings.service';
import { UpdateSettingsDto } from '../settings/settings.dto';
import { AdminService } from './admin.service';
import { Actor, AuditService, NoStoreInterceptor } from './audit.service';
import {
  AuditQuery, CreateStaffDto, ProductsQuery, SetPasswordDto, SetStatusDto, ShipmentsQuery, UpdateProductDto, UsersQuery,
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
  ) {}

  @Get('stats')
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

  // ----- Audit jurnali -----
  @Get('audit')
  auditLog(@Query() q: AuditQuery) { return this.admin.listAudit(q); }
}
