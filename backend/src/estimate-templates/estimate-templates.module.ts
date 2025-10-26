
import { Module, forwardRef } from '@nestjs/common';
import { EstimateTemplatesController } from './estimate-templates.controller';
import { EstimateTemplatesService } from './estimate-templates.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RequestContextModule } from '../context/request-context.module';
import { EstimatesModule } from '../estimates/estimates.module';
import { TenantGuard } from '../tenancy/tenant.guard';

@Module({
  imports: [
    RequestContextModule,
    PrismaModule,
    forwardRef(() => EstimatesModule),
  ],
  controllers: [EstimateTemplatesController],
  providers: [EstimateTemplatesService, TenantGuard],
  exports: [EstimateTemplatesService],
})
export class EstimateTemplatesModule {}
