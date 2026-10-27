import { Module } from '@nestjs/common';
import { DockService } from './dock.service';
import { HubOpsController, HubsController } from './hub.controller';
import { HubOpsService } from './hub-ops.service';
import { HubService } from './hub.service';

@Module({ controllers: [HubsController, HubOpsController], providers: [HubService, HubOpsService, DockService], exports: [HubService, DockService] })
export class HubModule {}
