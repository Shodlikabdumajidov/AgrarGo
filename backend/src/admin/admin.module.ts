import { Global, Module } from '@nestjs/common';
import { ReviewsModule } from '../reviews/reviews.module';
import { ProfileModule } from '../profile/profile.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuditService, NoStoreInterceptor, StaffAuditInterceptor } from './audit.service';

@Global()
@Module({
  imports: [ProfileModule, ReviewsModule],
  controllers: [AdminController],
  providers: [AdminService, AuditService, StaffAuditInterceptor, NoStoreInterceptor],
  exports: [AuditService, StaffAuditInterceptor],
})
export class AdminModule {}
