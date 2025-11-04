import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RequestContextModule } from '../context/request-context.module';
import { TenantGuard } from '../tenancy/tenant.guard';
import { FileProcessingService } from './file-processing.service';

@Module({
  imports: [PrismaModule, RequestContextModule],
  controllers: [FilesController],
  providers: [FilesService, FileProcessingService, TenantGuard],
  exports: [FileProcessingService],
})
export class FilesModule {}
