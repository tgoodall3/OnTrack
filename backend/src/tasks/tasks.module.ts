import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantGuard } from '../tenancy/tenant.guard';
import { RequestContextModule } from '../context/request-context.module';

@Module({
  imports: [RequestContextModule, PrismaModule],
  controllers: [TasksController],
  providers: [TasksService, TenantGuard],
  exports: [TasksService],
})
export class TasksModule {}
