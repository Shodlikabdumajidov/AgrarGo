import { Module } from '@nestjs/common';
import { DriverPostController } from './driver-post.controller';
import { DriverOfferService } from './driver-offer.service';
import { DriverPostService } from './driver-post.service';

@Module({ controllers: [DriverPostController], providers: [DriverPostService, DriverOfferService] })
export class DriverPostModule {}
