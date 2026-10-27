import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminRole, Role } from '@prisma/client';
import { IsIn, IsOptional } from 'class-validator';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { AdminRoles } from '../common/admin-roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ThrottleProfile } from '../security/throttle-profile';
import { CreateSupplierDto, ProductDto, RejectSupplierDto, SuppliersQuery, UpdateProductDto, UpdateSupplierProfileDto } from './agro-store.dto';
import { AgroStoreService, MAX_AGRO_FILE_BYTES } from './agro-store.service';

class AgroQuery {
  @IsOptional() @IsIn(['crop', 'livestock']) mode?: 'crop' | 'livestock';
}

const upload = () => FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_AGRO_FILE_BYTES, files: 1 } });

/**
 * Agro-Store (dori va o'g'itlar). Katalog hozircha «TEZ KUNDA» (buyurtma yopiq).
 * Market va haydovchilar bu jarayonda ishtirok etmaydi (403). Sotuvchilarni faqat admin/dispetcher yaratadi; admin tasdiqlamaguncha postlar ommaga ko'rinmaydi.
 */
@Controller('agro-store')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AgroStoreController {
  constructor(private readonly store: AgroStoreService) {}

  @Get()
  @Roles(Role.FARMER, Role.ADMIN, Role.DISPATCHER)
  @Header('Cache-Control', 'no-store')
  catalog(@Query() q: AgroQuery) { return this.store.catalog(q.mode ?? 'crop'); }

  // ----- Admin / Dispetcher: sotuvchilar -----
  @Post('suppliers')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  createSupplier(@Body() dto: CreateSupplierDto) { return this.store.createSupplier(dto); }

  @Get('suppliers')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  @Header('Cache-Control', 'no-store')
  suppliers(@Query() q: SuppliersQuery) { return this.store.listSuppliers(q); }

  @Patch('suppliers/:id/verify')
  @Roles(Role.ADMIN)
  @AdminRoles(AdminRole.SAFETY_ADMIN)
  verify(@Param('id', ParseUUIDPipe) id: string) { return this.store.verify(id); }

  @Patch('suppliers/:id/reject')
  @Roles(Role.ADMIN)
  @AdminRoles(AdminRole.SAFETY_ADMIN)
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectSupplierDto) { return this.store.reject(id, dto.reason); }

  @Get('suppliers/:id/documents/:type')
  @Roles(Role.ADMIN, Role.DISPATCHER)
  async supplierDoc(@Param('id', ParseUUIDPipe) id: string, @Param('type') type: string, @Res() res: Response) {
    return this.send(res, await this.store.docFile(id, null, this.store.parseDocType(type)));
  }

  // ----- Sotuvchi: shaxsiy kabinet -----
  @Get('me')
  @Roles(Role.AGRO_SUPPLIER)
  @Header('Cache-Control', 'no-store')
  me(@CurrentUser() user: { id: string }) { return this.store.me(user.id); }

  @Put('me')
  @Roles(Role.AGRO_SUPPLIER)
  updateMe(@CurrentUser() user: { id: string }, @Body() dto: UpdateSupplierProfileDto) { return this.store.updateMe(user.id, dto); }

  @Post('me/documents/:type')
  @Roles(Role.AGRO_SUPPLIER)
  @ThrottleProfile('upload')
  @UseInterceptors(upload())
  uploadDoc(@CurrentUser() user: { id: string }, @Param('type') type: string, @UploadedFile() file?: Express.Multer.File) {
    return this.store.uploadDoc(user.id, this.store.parseDocType(type), file);
  }

  @Get('me/documents/:type')
  @Roles(Role.AGRO_SUPPLIER)
  async myDoc(@CurrentUser() user: { id: string }, @Param('type') type: string, @Res() res: Response) {
    return this.send(res, await this.store.docFile(null, user.id, this.store.parseDocType(type)));
  }

  @Get('me/products')
  @Roles(Role.AGRO_SUPPLIER)
  @Header('Cache-Control', 'no-store')
  myProducts(@CurrentUser() user: { id: string }) { return this.store.myProducts(user.id); }

  @Post('me/products')
  @Roles(Role.AGRO_SUPPLIER)
  createProduct(@CurrentUser() user: { id: string }, @Body() dto: ProductDto) { return this.store.createProduct(user.id, dto); }

  @Put('me/products/:id')
  @Roles(Role.AGRO_SUPPLIER)
  updateProduct(@CurrentUser() user: { id: string }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) { return this.store.updateProduct(user.id, id, dto); }

  @Delete('me/products/:id')
  @HttpCode(200)
  @Roles(Role.AGRO_SUPPLIER)
  removeProduct(@CurrentUser() user: { id: string }, @Param('id', ParseUUIDPipe) id: string) { return this.store.removeProduct(user.id, id); }

  @Post('me/products/:id/photo')
  @Roles(Role.AGRO_SUPPLIER)
  @ThrottleProfile('upload')
  @UseInterceptors(upload())
  photo(@CurrentUser() user: { id: string }, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: Express.Multer.File) { return this.store.setPhoto(user.id, id, file); }

  private send(res: Response, f: { stream: NodeJS.ReadableStream; mime: string }) {
    res.set({ 'Content-Type': f.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    (f.stream as any).pipe(res);
  }
}
