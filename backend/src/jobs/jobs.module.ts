import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantGuard } from '../tenancy/tenant.guard';
import { RequestContextModule } from '../context/request-context.module';

@Module({
  imports: [RequestContextModule, PrismaModule],
  controllers: [JobsController],
  providers: [JobsService, TenantGuard],
  exports: [JobsService],
})
export class JobsModule {}
