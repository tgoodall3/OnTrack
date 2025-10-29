-- Track file scanning/processing state
CREATE TYPE "FileScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'FAILED');

ALTER TABLE "File"
  ADD COLUMN "scanStatus" "FileScanStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "scanMessage" TEXT,
  ADD COLUMN "processedAt" TIMESTAMP(3);
