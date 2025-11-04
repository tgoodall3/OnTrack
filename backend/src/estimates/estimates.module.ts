import { Module } from '@nestjs/common';
import { EstimatesController } from './estimates.controller';
import { EstimatesService } from './estimates.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantGuard } from '../tenancy/tenant.guard';
import { RequestContextModule } from '../context/request-context.module';
import { EstimateMailerService } from './estimate-mailer.service';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [RequestContextModule, PrismaModule, FilesModule],
  controllers: [EstimatesController],
  providers: [EstimatesService, EstimateMailerService, TenantGuard],
  exports: [EstimatesService],
})
export class EstimatesModule {}
