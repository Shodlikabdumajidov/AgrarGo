import { Global, Module } from '@nestjs/common';
import { EBolService } from './ebol.service';

@Global()
@Module({ providers: [EBolService], exports: [EBolService] })
export class EBolModule {}
