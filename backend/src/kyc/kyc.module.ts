import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';

@Module({ imports: [AdminModule], controllers: [KycController], providers: [KycService] })
export class KycModule {}
