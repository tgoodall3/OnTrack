-- CreateEnum
CREATE TYPE "MaterialApprovalStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "MaterialUsage"
  ADD COLUMN IF NOT EXISTS "costCode" TEXT,
  ADD COLUMN IF NOT EXISTS "recordedById" TEXT,
  ADD COLUMN IF NOT EXISTS "approvalStatus" "MaterialApprovalStatus" DEFAULT 'SUBMITTED',
  ADD COLUMN IF NOT EXISTS "approverId" TEXT,
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;

UPDATE "MaterialUsage" SET "approvalStatus" = 'SUBMITTED' WHERE "approvalStatus" IS NULL;

ALTER TABLE "MaterialUsage"
  ALTER COLUMN "approvalStatus" SET NOT NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MaterialUsage_tenantId_approvalStatus_idx" ON "MaterialUsage"("tenantId", "approvalStatus");

-- AddForeignKey (optional – ignore if constraint exists already)
ALTER TABLE "MaterialUsage" DROP CONSTRAINT IF EXISTS "MaterialUsage_recordedById_fkey";
ALTER TABLE "MaterialUsage" ADD CONSTRAINT "MaterialUsage_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL;

ALTER TABLE "MaterialUsage" DROP CONSTRAINT IF EXISTS "MaterialUsage_approverId_fkey";
ALTER TABLE "MaterialUsage" ADD CONSTRAINT "MaterialUsage_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL;
