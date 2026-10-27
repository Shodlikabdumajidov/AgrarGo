import { Controller, Get, Header, Param, ParseUUIDPipe, Query, Res, UseGuards } from '@nestjs/common';
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

  private send(res: Response, pdf: Buffer, name: string, inline = false) {
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${name}"`,
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

  /** Bill of Lading & Invoice (Amerika B2B BOL shakli). ?inline=1 — brauzerda ochiladi, aks holda yuklab olinadi */
  @Get('bol/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.FARMER, Role.DRIVER, Role.MARKET, Role.DISPATCHER, Role.ADMIN)
  async bol(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Query('inline') inline: string | undefined, @Res() res: Response) {
    this.send(res, await this.docs.bol(user, id), `BOL-${id.slice(0, 8).toUpperCase()}.pdf`, inline === '1' || inline === 'true');
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
  async verify(@Param('kind') kind: string, @Param('shipmentId', ParseUUIDPipe) id: string, @Param('code') code: string, @Query('format') format: string | undefined, @Query('download') download: string | undefined, @Res() res: Response) {
    // BOL: kod to'g'ri bo'lsa brauzerda rasmiy PDF ochiladi (?download=1 — yuklab olish, ?format=json — qisqa JSON)
    if (kind === 'bol' && format !== 'json') {
      const pdf = await this.docs.publicBol(id, code.slice(0, 40));
      if (!pdf) return res.status(404).type('text/plain').send('Hujjat topilmadi yoki kod noto\'g\'ri / Document not found or invalid code');
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${download === '1' || download === 'true' ? 'attachment' : 'inline'}; filename="BOL-${id.slice(0, 8).toUpperCase()}.pdf"`,
        'Content-Length': String(pdf.length),
        'Cache-Control': 'no-store',
      });
      return res.end(pdf);
    }
    if (kind !== 'ttn' && kind !== 'receipt' && kind !== 'bol') return res.json({ valid: false });
    return res.json(await this.docs.verify(kind as DocKind, id, code.slice(0, 40)));
  }
}

/**
 * Buyurtma bo'yicha hujjatlar: `GET /orders/:id/bol.pdf` (BOL) va `GET /orders/:id/invoice.pdf` (hisob-faktura) — bitta «BOL & Invoice» hujjati.
 * :id — buyurtma (bron / ombor buyurtmasi) yoki yuk identifikatori. Brauzerda ochiladi (inline), ?download=1 bilan yuklab olinadi.
 */
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.FARMER, Role.DRIVER, Role.MARKET, Role.DISPATCHER, Role.ADMIN)
export class OrderDocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  private async serve(user: any, id: string, kind: 'bol' | 'invoice', download: string | undefined, res: Response) {
    const pdf = await this.docs.bol(user, id);
    const asAttachment = download === '1' || download === 'true';
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${asAttachment ? 'attachment' : 'inline'}; filename="${kind === 'bol' ? 'BOL' : 'Invoice'}-${id.slice(0, 8).toUpperCase()}.pdf"`,
      'Content-Length': String(pdf.length),
      'Cache-Control': 'no-store',
    });
    res.end(pdf);
  }

  @Get(':id/bol.pdf')
  bol(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Query('download') download: string | undefined, @Res() res: Response) {
    return this.serve(user, id, 'bol', download, res);
  }

  @Get(':id/invoice.pdf')
  invoice(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Query('download') download: string | undefined, @Res() res: Response) {
    return this.serve(user, id, 'invoice', download, res);
  }
}
