import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsIn, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { AGRO_POSTS, AGRO_PRODUCTS, AgroMode } from './agro-store.data';

class AgroQuery {
  @IsOptional() @IsIn(['crop', 'livestock']) mode?: AgroMode;
}

/** Agro-Store (dori va o'g'itlar): hozircha «TEZ KUNDA» — faqat ko'rgazma uchun mock katalog, buyurtma qabul qilinmaydi */
@Controller('agro-store')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.FARMER, Role.ADMIN)
export class AgroStoreController {
  @Get()
  @Header('Cache-Control', 'no-store')
  catalog(@Query() q: AgroQuery) {
    const mode: AgroMode = q.mode ?? 'crop';
    return {
      status: 'COMING_SOON',
      orderingEnabled: false,
      mode,
      modes: ['crop', 'livestock'],
      products: AGRO_PRODUCTS.filter((x) => x.mode === mode),
      posts: AGRO_POSTS.filter((x) => x.mode === mode),
    };
  }
}
