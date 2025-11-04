import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "MaterialApprovalStatus" AS ENUM ('SUBMITTED','APPROVED','REJECTED');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "MaterialUsage"
      ADD COLUMN IF NOT EXISTS "costCode" TEXT;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "MaterialUsage"
      ADD COLUMN IF NOT EXISTS "recordedById" TEXT;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "MaterialUsage"
      ADD COLUMN IF NOT EXISTS "approvalStatus" "MaterialApprovalStatus";
  `);

  await prisma.$executeRawUnsafe(`
    UPDATE "MaterialUsage" SET "approvalStatus" = 'SUBMITTED' WHERE "approvalStatus" IS NULL;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "MaterialUsage"
      ALTER COLUMN "approvalStatus" SET NOT NULL;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "MaterialUsage"
      ALTER COLUMN "approvalStatus" SET DEFAULT 'SUBMITTED';
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "MaterialUsage"
      ADD COLUMN IF NOT EXISTS "approverId" TEXT;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "MaterialUsage"
      ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "MaterialUsage"
      ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "MaterialUsage_tenantId_approvalStatus_idx"
      ON "MaterialUsage"("tenantId", "approvalStatus");
  `);
}

main()
  .catch((error) => {
    console.error('Failed to apply materials schema updates', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
