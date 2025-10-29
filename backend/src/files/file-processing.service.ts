
import { Injectable, Logger } from '@nestjs/common';
import { FileScanStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { FileWithRelations } from './files.service';

const FILE_RELATION_INCLUDE = {
  uploadedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} as const;

@Injectable()
export class FileProcessingService {
  private readonly logger = new Logger(FileProcessingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async processUploadedFile(fileId: string): Promise<FileWithRelations> {
    try {
      return await this.prisma.file.update({
        where: { id: fileId },
        data: {
          scanStatus: FileScanStatus.CLEAN,
          scanMessage: 'Scan completed successfully.',
          processedAt: new Date(),
        },
        include: FILE_RELATION_INCLUDE,
      });
    } catch (error) {
      this.logger.error(
        `Failed to process file ${fileId}: ${String(
          (error as Error)?.message ?? error,
        )}`,
      );

      return await this.prisma.file.update({
        where: { id: fileId },
        data: {
          scanStatus: FileScanStatus.FAILED,
          scanMessage:
            'Automatic scan failed. Replace the file or retry the upload.',
        },
        include: FILE_RELATION_INCLUDE,
      });
    }
  }
}
