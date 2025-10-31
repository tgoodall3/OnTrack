import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/app.config';
import { Readable } from 'node:stream';

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
  private readonly useSignedUrls: boolean;
  private readonly maxUploadBytes: number;
  private readonly uploadExpiresInSeconds: number;
  private readonly downloadExpiresInSeconds: number;
  private readonly s3Client: S3Client;

  constructor(
    private readonly configService: ConfigService<AppConfig>,
  ) {
    const storageConfig = this.configService.get('storage', { infer: true });
    this.bucket = storageConfig.bucket;
    this.region = storageConfig.region;
    this.publicUrl = storageConfig.publicUrl ?? undefined;
    this.useSignedUrls = storageConfig.useSignedUrls;
    this.maxUploadBytes = storageConfig.maxUploadBytes;
    this.uploadExpiresInSeconds = storageConfig.uploadExpiresInSeconds;
    this.downloadExpiresInSeconds = storageConfig.downloadExpiresInSeconds;

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

  get signedUrlEnabled(): boolean {
    return this.useSignedUrls;
  }

  get downloadExpirySeconds(): number {
    return this.downloadExpiresInSeconds;
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

  async createPresignedDownload(
    key: string,
    expiresIn = this.downloadExpiresInSeconds,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.s3Client, command, {
      expiresIn,
    });
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

  async getObject(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.s3Client.send(command);
    const { Body } = response;

    if (!Body) {
      throw new Error(`Object ${key} returned an empty response body.`);
    }

    return this.toBuffer(Body);
  }

  private async toBuffer(body: unknown): Promise<Buffer> {
    if (body instanceof Readable) {
      const chunks: Buffer[] = [];
      for await (const chunk of body) {
        chunks.push(
          typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk),
        );
      }
      return Buffer.concat(chunks);
    }

    if (body instanceof Uint8Array) {
      return Buffer.from(body);
    }

    if (
      typeof (body as { transformToByteArray?: () => Promise<Uint8Array> })
        ?.transformToByteArray === 'function'
    ) {
      const array = await (
        body as { transformToByteArray: () => Promise<Uint8Array> }
      ).transformToByteArray();
      return Buffer.from(array);
    }

    if (
      typeof (body as { arrayBuffer?: () => Promise<ArrayBuffer> })?.arrayBuffer ===
      'function'
    ) {
      const arrayBuffer = await (
        body as { arrayBuffer: () => Promise<ArrayBuffer> }
      ).arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    throw new Error('Unsupported S3 response body type.');
  }
}
