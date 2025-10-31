/* eslint-disable no-console */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { FileProcessingService } from '../src/files/file-processing.service';
import { FileType } from '@prisma/client';

const DEFAULT_BATCH_SIZE = Number(process.env.BACKFILL_FILE_BATCH_SIZE ?? 50);

async function backfillPreviews(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService);
    const processor = app.get(FileProcessingService);

    let processed = 0;
    let cursor: string | undefined;
    const batchSize = DEFAULT_BATCH_SIZE;

    console.info(
      `Starting file preview backfill (batch size: ${batchSize}). This will reprocess image files sequentially.`,
    );

    // iterate in ascending creation order to avoid missing records when new files are added mid-run
    while (true) {
      const files = await prisma.file.findMany({
        where: {
          type: FileType.IMAGE,
        },
        select: {
          id: true,
          metadata: true,
        },
        orderBy: { createdAt: 'asc' },
        take: batchSize,
        ...(cursor
          ? {
              skip: 1,
              cursor: { id: cursor },
            }
          : {}),
      });

      if (!files.length) {
        break;
      }

      for (const file of files) {
        try {
          await processor.processUploadedFile(file.id);
          processed += 1;
          if (processed % 25 === 0) {
            console.info(`Processed ${processed} files...`);
          }
        } catch (error) {
          console.warn(
            `Failed to process file ${file.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      cursor = files[files.length - 1]?.id;
    }

    console.info(`Backfill complete. Processed ${processed} image file(s).`);
  } finally {
    await app.close();
  }
}

backfillPreviews().catch((error) => {
  console.error('Backfill failed:', error);
  process.exitCode = 1;
});
