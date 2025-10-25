import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { RequestContextModule } from '../context/request-context.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantGuard } from '../tenancy/tenant.guard';

@Module({
  imports: [RequestContextModule, PrismaModule],
  controllers: [DashboardController],
  providers: [DashboardService, TenantGuard],
})
export class DashboardModule {}
