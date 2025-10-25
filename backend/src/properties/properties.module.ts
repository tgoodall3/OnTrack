import { Module } from '@nestjs/common';
import { PropertiesController } from './properties.controller';
import { PropertiesService } from './properties.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantGuard } from '../tenancy/tenant.guard';
import { RequestContextModule } from '../context/request-context.module';

@Module({
  imports: [RequestContextModule, PrismaModule],
  controllers: [PropertiesController],
  providers: [PropertiesService, TenantGuard],
  exports: [PropertiesService],
})
export class PropertiesModule {}
