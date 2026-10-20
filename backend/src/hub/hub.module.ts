import { Module } from '@nestjs/common';
import { DockService } from './dock.service';
import { HubOpsController, HubsController } from './hub.controller';
import { HubService } from './hub.service';

@Module({ controllers: [HubsController, HubOpsController], providers: [HubService, DockService], exports: [HubService, DockService] })
export class HubModule {}
