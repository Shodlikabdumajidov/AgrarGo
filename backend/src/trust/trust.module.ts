import { Global, Module } from '@nestjs/common';
import { RatingsService } from './ratings.service';
import { TrustController } from './trust.controller';
import { TrustService } from './trust.service';

/** Global: yuk va ombor xizmatlari haydovchi kartochkasiga ishonch ma'lumotini qo'shadi */
@Global()
@Module({ controllers: [TrustController], providers: [TrustService, RatingsService], exports: [TrustService] })
export class TrustModule {}
