import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantGuard } from '../tenancy/tenant.guard';
import { RequestContextModule } from '../context/request-context.module';
import { TimeEntriesController } from './time-entries/time-entries.controller';
import { TimeEntriesService } from './time-entries/time-entries.service';

@Module({
  imports: [RequestContextModule, PrismaModule],
  controllers: [JobsController, TimeEntriesController],
  providers: [JobsService, TimeEntriesService, TenantGuard],
  exports: [JobsService, TimeEntriesService],
})
export class JobsModule {}
