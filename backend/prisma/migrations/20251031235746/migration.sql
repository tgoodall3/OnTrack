/*
  Warnings:

  - You are about to drop the column `gps` on the `TimeEntry` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "TimeEntryStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ADJUSTMENT_REQUESTED');

-- AlterTable
ALTER TABLE "TimeEntry" DROP COLUMN "gps",
ADD COLUMN     "approvalNote" TEXT,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approverId" TEXT,
ADD COLUMN     "clockInLocation" JSONB,
ADD COLUMN     "clockOutLocation" JSONB,
ADD COLUMN     "durationMinutes" INTEGER,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "status" "TimeEntryStatus" NOT NULL DEFAULT 'IN_PROGRESS',
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "submittedById" TEXT;

-- CreateIndex
CREATE INDEX "TimeEntry_tenantId_status_idx" ON "TimeEntry"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TimeEntry_tenantId_userId_clockIn_idx" ON "TimeEntry"("tenantId", "userId", "clockIn");

-- CreateIndex
CREATE INDEX "TimeEntry_tenantId_jobId_clockIn_idx" ON "TimeEntry"("tenantId", "jobId", "clockIn");

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
