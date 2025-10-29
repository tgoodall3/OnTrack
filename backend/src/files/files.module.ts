import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { RequestContextModule } from '../context/request-context.module';
import { TenantGuard } from '../tenancy/tenant.guard';
import { FileProcessingService } from './file-processing.service';

@Module({
  imports: [PrismaModule, StorageModule, RequestContextModule],
  controllers: [FilesController],
  providers: [FilesService, FileProcessingService, TenantGuard],
  exports: [FileProcessingService],
})
export class FilesModule {}
