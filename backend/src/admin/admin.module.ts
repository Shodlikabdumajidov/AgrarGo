import { Global, Module } from '@nestjs/common';
import { ProfileModule } from '../profile/profile.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuditService, NoStoreInterceptor, StaffAuditInterceptor } from './audit.service';

@Global()
@Module({
  imports: [ProfileModule],
  controllers: [AdminController],
  providers: [AdminService, AuditService, StaffAuditInterceptor, NoStoreInterceptor],
  exports: [AuditService, StaffAuditInterceptor],
})
export class AdminModule {}
