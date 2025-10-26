import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/app.config';

export interface PresignedUpload {
  url: string;
  expiresIn: number;
  headers: Record<string, string>;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket: string;
  private readonly region: string;
  private readonly publicUrl?: string;
  private readonly maxUploadBytes: number;
  private readonly uploadExpiresInSeconds: number;
  private readonly s3Client: S3Client;

  constructor(
    private readonly configService: ConfigService<AppConfig>,
  ) {
    const storageConfig = this.configService.get('storage', { infer: true });
    this.bucket = storageConfig.bucket;
    this.region = storageConfig.region;
    this.publicUrl = storageConfig.publicUrl ?? undefined;
    this.maxUploadBytes = storageConfig.maxUploadBytes;
    this.uploadExpiresInSeconds = storageConfig.uploadExpiresInSeconds;

    const endpoint = storageConfig.endpoint?.trim();
    this.s3Client = new S3Client({
      region: storageConfig.region,
      endpoint: endpoint && endpoint.length > 0 ? endpoint : undefined,
      forcePathStyle: storageConfig.forcePathStyle,
      credentials: {
        accessKeyId: storageConfig.accessKey,
        secretAccessKey: storageConfig.secretKey,
      },
      tls: storageConfig.useSSL,
    });
  }

  get maxUploadSize(): number {
    return this.maxUploadBytes;
  }

  get uploadExpirySeconds(): number {
    return this.uploadExpiresInSeconds;
  }

  async createPresignedUpload(
    key: string,
    contentType: string,
    contentLength: number,
  ): Promise<PresignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
    });

    const url = await getSignedUrl(this.s3Client, command, {
      expiresIn: this.uploadExpiresInSeconds,
    });

    return {
      url,
      expiresIn: this.uploadExpiresInSeconds,
      headers: {
        'Content-Type': contentType,
      },
    };
  }

  async uploadObject(
    key: string,
    body: Buffer | Uint8Array,
    contentType: string,
  ): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    });

    await this.s3Client.send(command);
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Failed to delete object ${key} from bucket ${this.bucket}: ${String(
          (error as Error)?.message ?? error,
        )}`,
      );
    }
  }

  resolvePublicUrl(key: string): string {
    const normalizedKey = key.replace(/^\//, '');
    if (this.publicUrl) {
      return `${this.publicUrl.replace(/\/$/, '')}/${normalizedKey}`;
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${normalizedKey}`;
  }
}
