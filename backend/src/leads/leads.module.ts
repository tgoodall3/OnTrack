import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantGuard } from '../tenancy/tenant.guard';
import { RequestContextModule } from '../context/request-context.module';

@Module({
  imports: [RequestContextModule, PrismaModule],
  controllers: [LeadsController],
  providers: [LeadsService, TenantGuard],
  exports: [LeadsService],
})
export class LeadsModule {}
