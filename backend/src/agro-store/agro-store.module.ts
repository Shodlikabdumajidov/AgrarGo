import { Module } from '@nestjs/common';
import { AgroStoreController } from './agro-store.controller';
import { AgroStoreService } from './agro-store.service';

@Module({ controllers: [AgroStoreController], providers: [AgroStoreService] })
export class AgroStoreModule {}
