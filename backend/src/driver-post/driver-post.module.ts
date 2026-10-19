import { Module } from '@nestjs/common';
import { DriverPostController } from './driver-post.controller';
import { DriverPostService } from './driver-post.service';

@Module({ controllers: [DriverPostController], providers: [DriverPostService] })
export class DriverPostModule {}
