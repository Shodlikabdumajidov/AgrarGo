import { Module } from '@nestjs/common';
import { AgroStoreController } from './agro-store.controller';

@Module({ controllers: [AgroStoreController] })
export class AgroStoreModule {}
