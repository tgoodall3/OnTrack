import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { RequestContextModule } from '../context/request-context.module';

@Module({
  imports: [PrismaModule, StorageModule, RequestContextModule],
  controllers: [FilesController],
  providers: [FilesService],
})
export class FilesModule {}
