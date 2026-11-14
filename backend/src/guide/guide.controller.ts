import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { GUIDE_ROLES, GuideRole, LANGS, Lang, guideFor } from './guide-content';
import { buildGuidePdf } from './guide-pdf';

const lang = (v?: string): Lang => (LANGS.includes(v as Lang) ? (v as Lang) : 'uz');
const role = (v?: string): GuideRole | undefined => (GUIDE_ROLES.includes(v as GuideRole) ? (v as GuideRole) : undefined);

/** O'quv qo'llanma: ommaviy kontent (shaxsiy ma'lumot yo'q) */
@Controller('guide')
export class GuideController {
  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  get(@Query('lang') l?: string, @Query('role') r?: string) {
    return guideFor(lang(l), role(r));
  }

  @Get('pdf')
  async pdf(@Res() res: Response, @Query('lang') l?: string, @Query('role') r?: string) {
    const lg = lang(l), rl = role(r);
    const buf = await buildGuidePdf(lg, rl);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="AgrarGo-guide-${lg}${rl ? '-' + rl.toLowerCase() : ''}.pdf"`,
      'Content-Length': String(buf.length),
      'Cache-Control': 'public, max-age=300',
    });
    res.end(buf);
  }
}
