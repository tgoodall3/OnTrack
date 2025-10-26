-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN "templateId" TEXT;

-- CreateTable
CREATE TABLE "EstimateTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EstimateTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateTemplateItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12, 2) NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12, 2) NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EstimateTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EstimateTemplate_tenantId_name_key" ON "EstimateTemplate"("tenantId", "name");

-- CreateIndex
CREATE INDEX "EstimateTemplate_tenantId_isArchived_idx" ON "EstimateTemplate"("tenantId", "isArchived");

-- CreateIndex
CREATE INDEX "EstimateTemplateItem_templateId_order_idx" ON "EstimateTemplateItem"("templateId", "order");

-- CreateIndex
CREATE INDEX "Estimate_templateId_idx" ON "Estimate"("templateId");

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EstimateTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateTemplate" ADD CONSTRAINT "EstimateTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateTemplateItem" ADD CONSTRAINT "EstimateTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EstimateTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
