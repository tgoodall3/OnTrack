import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileType, FileScanStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateUploadDto } from './dto/create-upload.dto';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { AppConfig } from '../config/app.config';
import { RequestContextService } from '../context/request-context.service';
import { FileProcessingService } from './file-processing.service';

type FileScope = {
  jobId?: string;
  estimateId?: string;
  invoiceId?: string;
};

type FileScopeValidation = FileScope & {
  pathSegments: string[];
};

export type FileWithRelations = Prisma.FileGetPayload<{
  include: {
    uploadedBy: {
      select: {
        id: true;
        name: true;
        email: true;
      };
    };
  };
}>;

export interface FileSummary {
  id: string;
  url: string;
  type: FileType;
  createdAt: string;
  fileName: string;
  fileSize?: number | null;
  mimeType?: string | null;
  scanStatus: FileScanStatus;
  scanMessage?: string | null;
  processedAt?: string | null;
  isProcessing: boolean;
  jobId?: string | null;
  estimateId?: string | null;
  invoiceId?: string | null;
  previewUrl?: string | null;
  thumbnailUrl?: string | null;
  width?: number | null;
  height?: number | null;
  aspectRatio?: number | null;
  dominantColor?: string | null;
  uploadedBy?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly maxUploadBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly requestContext: RequestContextService,
    private readonly configService: ConfigService<AppConfig>,
    private readonly fileProcessing: FileProcessingService,
  ) {
    const storageConfig = this.configService.get('storage', { infer: true });
    this.maxUploadBytes = storageConfig.maxUploadBytes;
  }

  async createUpload(dto: CreateUploadDto) {
    if (dto.fileSize > this.maxUploadBytes) {
      throw new BadRequestException(
        `File exceeds maximum size of ${this.formatBytes(this.maxUploadBytes)}.`,
      );
    }

    const tenantId = this.prisma.getTenantIdOrThrow();
    const scope = await this.ensureScope(dto);
    const key = this.buildObjectKey(tenantId, scope.pathSegments, dto.fileName);

    const upload = await this.storage.createPresignedUpload(
      key,
      dto.mimeType,
      dto.fileSize,
    );

    return {
      key,
      uploadUrl: upload.url,
      expiresIn: upload.expiresIn,
      headers: upload.headers,
      maxUploadBytes: this.storage.maxUploadSize,
    };
  }

  async finalizeUpload(dto: CompleteUploadDto) {
    if (dto.fileSize > this.maxUploadBytes) {
      throw new BadRequestException(
        `File exceeds maximum size of ${this.formatBytes(this.maxUploadBytes)}.`,
      );
    }

    const tenantId = this.prisma.getTenantIdOrThrow();
    const scope = await this.ensureScope(dto);

    if (!dto.key.startsWith(`tenants/${tenantId}/`)) {
      throw new BadRequestException('Upload key is not valid for this tenant.');
    }

    const fileType = this.detectFileType(dto.mimeType);
    const metadata = {
      key: dto.key,
      fileName: dto.fileName,
      fileSize: dto.fileSize,
      mimeType: dto.mimeType,
    };

    const createData: Prisma.FileCreateInput = {
      tenant: { connect: { id: tenantId } },
      url: this.storage.resolvePublicUrl(dto.key),
      type: fileType,
      metadata,
      scanStatus: FileScanStatus.PENDING,
      scanMessage: 'Awaiting malware scan',
    };

    if (scope.jobId) {
      createData.job = { connect: { id: scope.jobId } };
    }

    if (scope.estimateId) {
      createData.estimate = { connect: { id: scope.estimateId } };
    }

    if (scope.invoiceId) {
      createData.invoice = { connect: { id: scope.invoiceId } };
    }

    const uploadedBy = this.requestContext.context.userId;
    if (uploadedBy) {
      createData.uploadedBy = { connect: { id: uploadedBy } };
    }

    const file = await this.prisma.file.create({
      data: createData,
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    let processedFile: FileWithRelations = file;
    try {
      processedFile = await this.fileProcessing.processUploadedFile(file.id);
    } catch (error) {
      this.logger.warn(
        `File processing failed for ${file.id}: ${String(
          (error as Error)?.message ?? error,
        )}`,
      );
    }

    await Promise.all([
      scope.jobId
        ? this.logJobActivity(tenantId, scope.jobId, 'job.file_uploaded', {
            fileId: file.id,
            fileName: dto.fileName,
            mimeType: dto.mimeType,
            size: dto.fileSize,
          })
        : undefined,
      scope.estimateId
        ? this.logEstimateActivity(
            tenantId,
            scope.estimateId,
            'estimate.file_uploaded',
            {
              fileId: file.id,
              fileName: dto.fileName,
              mimeType: dto.mimeType,
              size: dto.fileSize,
            },
          )
        : undefined,
    ]);

    return this.toSummary(processedFile);
  }

  async listForJob(jobId: string): Promise<FileSummary[]> {
    await this.ensureScope({ jobId });

    const files = await this.prisma.file.findMany({
      where: { jobId },
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return files.map((file) => this.toSummary(file));
  }

  async listForEstimate(estimateId: string): Promise<FileSummary[]> {
    await this.ensureScope({ estimateId });

    const files = await this.prisma.file.findMany({
      where: { estimateId },
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return files.map((file) => this.toSummary(file));
  }

  async remove(fileId: string): Promise<void> {
    const tenantId = this.prisma.getTenantIdOrThrow();

    const file = await this.prisma.file.findFirst({
      where: { id: fileId, tenantId },
      include: {
        uploadedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!file) {
      throw new BadRequestException('File not found');
    }

    const metadata = this.toRecord(file.metadata);
    const keysToDelete = [
      ...this.extractVariantKeys(metadata),
      typeof metadata?.key === 'string' ? metadata.key : undefined,
    ].filter((value): value is string => Boolean(value));

    if (keysToDelete.length === 0) {
      this.logger.warn(
        `File ${file.id} metadata missing storage keys; skipping object deletion.`,
      );
    } else {
      await Promise.all(
        keysToDelete.map((objectKey) =>
          this.storage.deleteObject(objectKey).catch((error) => {
            this.logger.warn(
              `Failed to delete object ${objectKey} for file ${file.id}: ${String(
                (error as Error)?.message ?? error,
              )}`,
            );
          }),
        ),
      );
    }

    await this.prisma.file.delete({ where: { id: file.id } });

    await Promise.all([
      file.jobId
        ? this.logJobActivity(tenantId, file.jobId, 'job.file_deleted', {
            fileId: file.id,
            fileName: metadata?.fileName,
          })
        : undefined,
      file.estimateId
        ? this.logEstimateActivity(
            tenantId,
            file.estimateId,
            'estimate.file_deleted',
            {
              fileId: file.id,
              fileName: metadata?.fileName,
            },
          )
        : undefined,
    ]);
  }

  private async ensureScope(scope: FileScope): Promise<FileScopeValidation> {
    const tenantId = this.prisma.getTenantIdOrThrow();
    const pathSegments: string[] = [];

    if (scope.jobId) {
      const job = await this.prisma.job.findFirst({
        where: { id: scope.jobId, tenantId },
        select: { id: true },
      });

      if (!job) {
        throw new BadRequestException('Job not found');
      }

      pathSegments.push('jobs', scope.jobId);
    }

    if (scope.estimateId) {
      const estimate = await this.prisma.estimate.findFirst({
        where: { id: scope.estimateId, tenantId },
        select: { id: true },
      });

      if (!estimate) {
        throw new BadRequestException('Estimate not found');
      }

      pathSegments.push('estimates', scope.estimateId);
    }

    if (scope.invoiceId) {
      const invoice = await this.prisma.invoice.findFirst({
        where: { id: scope.invoiceId, tenantId },
        select: { id: true },
      });

      if (!invoice) {
        throw new BadRequestException('Invoice not found');
      }

      pathSegments.push('invoices', scope.invoiceId);
    }

    if (pathSegments.length === 0) {
      throw new BadRequestException(
        'Provide a jobId, estimateId, or invoiceId for file uploads.',
      );
    }

    return {
      jobId: scope.jobId,
      estimateId: scope.estimateId,
      invoiceId: scope.invoiceId,
      pathSegments,
    };
  }

  private buildObjectKey(
    tenantId: string,
    segments: string[],
    fileName: string,
  ): string {
    const now = new Date();
    const safeBase = this.sanitizeFileName(fileName);
    const extension = this.extractExtension(fileName);
    const timestamp = `${now.getUTCFullYear()}${(now.getUTCMonth() + 1)
      .toString()
      .padStart(2, '0')}${now.getUTCDate().toString().padStart(2, '0')}`;
    const prefix = [
      'tenants',
      tenantId,
      ...segments,
      'uploads',
      now.getUTCFullYear().toString(),
      (now.getUTCMonth() + 1).toString().padStart(2, '0'),
      now.getUTCDate().toString().padStart(2, '0'),
    ]
      .filter(Boolean)
      .join('/');

    const unique = randomUUID();
    return `${prefix}/${timestamp}-${unique}-${safeBase}${
      extension ? `.${extension}` : ''
    }`;
  }

  private sanitizeFileName(fileName: string): string {
    const base = fileName
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\.[^/.]+$/, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return base.length ? base : 'file';
  }

  private extractExtension(fileName: string): string | null {
    const match = /\.([a-zA-Z0-9]{1,10})$/.exec(fileName);
    if (!match) {
      return null;
    }
    return match[1].toLowerCase();
  }

  private detectFileType(mimeType: string): FileType {
    if (!mimeType) {
      return FileType.OTHER;
    }

    if (mimeType.startsWith('image/')) {
      return FileType.IMAGE;
    }

    if (mimeType.startsWith('video/')) {
      return FileType.VIDEO;
    }

    if (
      mimeType.startsWith('application/pdf') ||
      mimeType.includes('word') ||
      mimeType.includes('excel') ||
      mimeType.includes('powerpoint') ||
      mimeType.startsWith('text/')
    ) {
      return FileType.DOCUMENT;
    }

    return FileType.OTHER;
  }

  private toSummary(file: FileWithRelations): FileSummary {
    const metadata = this.toRecord(file.metadata);
    const processedAt =
      file.processedAt instanceof Date ? file.processedAt.toISOString() : null;
    const scanMessage =
      typeof file.scanMessage === 'string' && file.scanMessage.trim().length > 0
        ? file.scanMessage
        : null;
    const fileSize =
      typeof metadata?.fileSize === 'number' ? metadata.fileSize : null;
    const mimeType =
      typeof metadata?.mimeType === 'string' ? metadata.mimeType : null;
    const width = typeof metadata?.width === 'number' ? metadata.width : null;
    const height =
      typeof metadata?.height === 'number' ? metadata.height : null;
    const aspectRatio =
      typeof metadata?.aspectRatio === 'number' ? metadata.aspectRatio : null;
    const dominantColor =
      typeof metadata?.dominantColor === 'string'
        ? metadata.dominantColor
        : null;

    const variants = this.toRecord(
      metadata?.variants as Prisma.JsonValue | null | undefined,
    );
    const previewVariant = variants
      ? this.toRecord(
          variants.preview as Prisma.JsonValue | null | undefined,
        )
      : null;
    const thumbnailVariant = variants
      ? this.toRecord(
          variants.thumbnail as Prisma.JsonValue | null | undefined,
        )
      : null;

    const previewUrl =
      (typeof previewVariant?.url === 'string'
        ? previewVariant.url
        : typeof previewVariant?.key === 'string'
          ? this.storage.resolvePublicUrl(previewVariant.key)
          : null) ?? null;

    const thumbnailUrl =
      (typeof thumbnailVariant?.url === 'string'
        ? thumbnailVariant.url
        : typeof thumbnailVariant?.key === 'string'
          ? this.storage.resolvePublicUrl(thumbnailVariant.key)
          : null) ?? null;

    const isProcessing =
      file.scanStatus === FileScanStatus.PENDING && !processedAt;

    return {
      id: file.id,
      url: file.url,
      type: file.type,
      createdAt: file.createdAt.toISOString(),
      fileName:
        typeof metadata?.fileName === 'string' ? metadata.fileName : 'File',
      fileSize,
      mimeType,
      scanStatus: file.scanStatus,
      scanMessage,
      processedAt,
      isProcessing,
      jobId: file.jobId,
      estimateId: file.estimateId,
      invoiceId: file.invoiceId,
      previewUrl,
      thumbnailUrl,
      width,
      height,
      aspectRatio,
      dominantColor,
      uploadedBy: file.uploadedBy ?? null,
    };
  }

  private toRecord(
    value: Prisma.JsonValue | null | undefined,
  ): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private extractVariantKeys(
    metadata: Record<string, unknown> | null,
  ): string[] {
    if (!metadata) {
      return [];
    }

    const variants = this.toRecord(metadata.variants as Prisma.JsonValue);
    if (!variants) {
      return [];
    }

    return Object.values(variants)
      .map((entry) => this.toRecord(entry as Prisma.JsonValue))
      .filter((entry): entry is Record<string, unknown> => Boolean(entry))
      .map((entry) =>
        typeof entry.key === 'string' && entry.key.length > 0
          ? entry.key
          : null,
      )
      .filter((key): key is string => Boolean(key));
  }

  private async logJobActivity(
    tenantId: string,
    jobId: string,
    action: string,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.activityLog.create({
      data: {
        tenantId,
        entityType: 'job',
        entityId: jobId,
        action,
        meta: meta as Prisma.JsonValue | undefined,
        actorId: this.requestContext.context.userId,
      },
    });
  }

  private async logEstimateActivity(
    tenantId: string,
    estimateId: string,
    action: string,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.activityLog.create({
      data: {
        tenantId,
        entityType: 'estimate',
        entityId: estimateId,
        action,
        meta: meta as Prisma.JsonValue | undefined,
        actorId: this.requestContext.context.userId,
      },
    });
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    const kb = bytes / 1024;
    if (kb < 1024) {
      return `${kb.toFixed(1)} KB`;
    }
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  }
}
