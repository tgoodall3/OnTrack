import { Module } from '@nestjs/common';
import { ChecklistsController } from './checklists.controller';
import { ChecklistsService } from './checklists.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantGuard } from '../tenancy/tenant.guard';
import { RequestContextModule } from '../context/request-context.module';

@Module({
  imports: [RequestContextModule, PrismaModule],
  controllers: [ChecklistsController],
  providers: [ChecklistsService, TenantGuard],
  exports: [ChecklistsService],
})
export class ChecklistsModule {}
