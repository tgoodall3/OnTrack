import { Module } from '@nestjs/common';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RequestContextModule } from '../context/request-context.module';
import { TenantGuard } from '../tenancy/tenant.guard';

@Module({
  imports: [PrismaModule, RequestContextModule],
  controllers: [MaterialsController],
  providers: [MaterialsService, TenantGuard],
  exports: [MaterialsService],
})
export class MaterialsModule {}
