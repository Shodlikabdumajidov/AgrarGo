import { Module } from '@nestjs/common';
import { HubOpsController, HubsController } from './hub.controller';
import { HubService } from './hub.service';

@Module({ controllers: [HubsController, HubOpsController], providers: [HubService], exports: [HubService] })
export class HubModule {}
