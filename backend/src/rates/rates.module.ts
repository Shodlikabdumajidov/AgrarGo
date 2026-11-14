import { Global, Module } from '@nestjs/common';
import { RatesController } from './rates.controller';
import { RatesService } from './rates.service';

@Global()
@Module({ controllers: [RatesController], providers: [RatesService], exports: [RatesService] })
export class RatesModule {}
