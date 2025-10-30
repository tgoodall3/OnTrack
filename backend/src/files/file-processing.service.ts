
import { Injectable, Logger } from '@nestjs/common';
import { FileScanStatus, FileType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { FileWithRelations } from './files.service';
import { StorageService } from '../storage/storage.service';
import sharp from 'sharp';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async processUploadedFile(fileId: string): Promise<FileWithRelations> {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
      include: FILE_RELATION_INCLUDE,
    });

    if (!file) {
      throw new Error(`File ${fileId} not found.`);
    }

    const metadata = this.toRecord(file.metadata) ?? {};
    let processedMetadata = metadata;

    if (file.type === FileType.IMAGE) {
      try {
        processedMetadata = await this.processImageFile(file, metadata);
      } catch (error) {
        this.logger.error(
          `Failed to optimize image ${fileId}: ${String(
            (error as Error)?.message ?? error,
          )}`,
        );
        return this.markFailed(fileId, metadata);
      }
    }

    try {
      return await this.markClean(fileId, processedMetadata);
    } catch (error) {
      this.logger.error(
        `Failed to process file ${fileId}: ${String(
          (error as Error)?.message ?? error,
        )}`,
      );

      return await this.markFailed(fileId, metadata);
    }
  }

  private async processImageFile(
    file: FileWithRelations,
    metadata: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const key =
      typeof metadata.key === 'string' && metadata.key.length > 0
        ? metadata.key
        : null;

    if (!key) {
      this.logger.warn(
        `File ${file.id} metadata missing storage key; skipping image processing.`,
      );
      return metadata;
    }

    const originalBuffer = await this.storage.getObject(key);
    const baseImage = sharp(originalBuffer, { failOnError: false });

    const baseMetadata = await baseImage.metadata();
    const stats = await baseImage
      .clone()
      .stats()
      .catch(() => null);

    const previewBuffer = await baseImage
      .clone()
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: sharp.fit.inside,
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82, chromaSubsampling: '4:4:4' })
      .toBuffer();

    const previewInfo = await sharp(previewBuffer).metadata();

    const thumbnailBuffer = await baseImage
      .clone()
      .rotate()
      .resize({
        width: 480,
        height: 320,
        fit: sharp.fit.cover,
        position: sharp.strategy.entropy,
      })
      .jpeg({ quality: 78, chromaSubsampling: '4:4:4' })
      .toBuffer();

    const thumbnailInfo = await sharp(thumbnailBuffer).metadata();

    const previewKey = this.buildVariantKey(key, '__preview.jpg');
    const thumbnailKey = this.buildVariantKey(key, '__thumb.jpg');

    await Promise.all([
      this.storage.uploadObject(previewKey, previewBuffer, 'image/jpeg'),
      this.storage.uploadObject(thumbnailKey, thumbnailBuffer, 'image/jpeg'),
    ]);

    const variants = this.toRecord(metadata.variants) ?? {};
    const generatedAt = new Date().toISOString();

    variants.preview = {
      key: previewKey,
      url: this.storage.resolvePublicUrl(previewKey),
      width: previewInfo.width ?? null,
      height: previewInfo.height ?? null,
      mimeType: 'image/jpeg',
      generatedAt,
    };

    variants.thumbnail = {
      key: thumbnailKey,
      url: this.storage.resolvePublicUrl(thumbnailKey),
      width: thumbnailInfo.width ?? null,
      height: thumbnailInfo.height ?? null,
      mimeType: 'image/jpeg',
      generatedAt,
    };

    const nextMetadata: Record<string, unknown> = {
      ...metadata,
      variants,
    };

    if (baseMetadata.width) {
      nextMetadata.width = baseMetadata.width;
    }
    if (baseMetadata.height) {
      nextMetadata.height = baseMetadata.height;
    }
    if (typeof baseMetadata.orientation === 'number') {
      nextMetadata.orientation = baseMetadata.orientation;
    }
    if (baseMetadata.width && baseMetadata.height && baseMetadata.height !== 0) {
      nextMetadata.aspectRatio =
        Math.round(
          ((baseMetadata.width / baseMetadata.height) + Number.EPSILON) * 1000,
        ) / 1000;
    }

    if (stats?.dominant) {
      nextMetadata.dominantColor = this.rgbToHex(
        stats.dominant.r,
        stats.dominant.g,
        stats.dominant.b,
      );
    }

    nextMetadata.processedAt = generatedAt;

    return nextMetadata;
  }

  private async markClean(
    fileId: string,
    metadata: Record<string, unknown>,
  ): Promise<FileWithRelations> {
    return this.prisma.file.update({
      where: { id: fileId },
      data: {
        scanStatus: FileScanStatus.CLEAN,
        scanMessage: 'Scan completed successfully.',
        processedAt: new Date(),
        metadata: metadata as Prisma.JsonValue,
      },
      include: FILE_RELATION_INCLUDE,
    });
  }

  private async markFailed(
    fileId: string,
    metadata: Record<string, unknown>,
  ): Promise<FileWithRelations> {
    return this.prisma.file.update({
      where: { id: fileId },
      data: {
        scanStatus: FileScanStatus.FAILED,
        scanMessage:
          'Automatic scan failed. Replace the file or retry the upload.',
        metadata: metadata as Prisma.JsonValue,
      },
      include: FILE_RELATION_INCLUDE,
    });
  }

  private buildVariantKey(originalKey: string, suffix: string): string {
    const dotIndex = originalKey.lastIndexOf('.');
    const base = dotIndex > -1 ? originalKey.slice(0, dotIndex) : originalKey;
    return `${base}${suffix}`;
  }

  private toRecord(
    value: unknown,
  ): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private rgbToHex(r: number, g: number, b: number): string {
    const clamp = (value: number) =>
      Math.max(0, Math.min(255, Math.round(value)));
    const toHex = (value: number) => clamp(value).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
}
