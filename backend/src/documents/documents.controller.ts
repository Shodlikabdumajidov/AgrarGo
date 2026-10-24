import { Controller, Get, Header, Param, ParseUUIDPipe, Res, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { DocKind, DocumentsService } from './documents.service';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  private send(res: Response, pdf: Buffer, name: string) {
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Content-Length': String(pdf.length),
      'Cache-Control': 'no-store',
    });
    res.end(pdf);
  }

  @Get('ttn/:shipmentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.FARMER, Role.DRIVER, Role.MARKET, Role.ADMIN)
  async ttn(@CurrentUser() user: any, @Param('shipmentId', ParseUUIDPipe) id: string, @Res() res: Response) {
    this.send(res, await this.docs.ttn(user, id), `TTN-${id.slice(0, 8).toUpperCase()}.pdf`);
  }

  @Get('receipt/:shipmentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.FARMER, Role.DRIVER, Role.MARKET, Role.ADMIN)
  async receipt(@CurrentUser() user: any, @Param('shipmentId', ParseUUIDPipe) id: string, @Res() res: Response) {
    this.send(res, await this.docs.receipt(user, id), `Chek-${id.slice(0, 8).toUpperCase()}.pdf`);
  }

  /** Ochiq tekshiruv (QR-kod skanerlangach): shaxsiy ma'lumot qaytarilmaydi */
  @Get('verify/:kind/:shipmentId/:code')
  @Header('Cache-Control', 'no-store')
  verify(@Param('kind') kind: string, @Param('shipmentId', ParseUUIDPipe) id: string, @Param('code') code: string) {
    if (kind !== 'ttn' && kind !== 'receipt') return { valid: false };
    return this.docs.verify(kind as DocKind, id, code.slice(0, 40));
  }
}
