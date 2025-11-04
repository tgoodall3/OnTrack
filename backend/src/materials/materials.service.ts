import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JobStatus, MaterialApprovalStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContextService } from '../context/request-context.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { ApproveMaterialDto, RejectMaterialDto } from './dto/review-material.dto';
import { ListMaterialsDto } from './dto/list-materials.dto';

export interface MaterialSummary {
  id: string;
  jobId: string;
  sku: string;
  costCode: string | null;
  quantity: number;
  unitCost: number;
  totalCost: number;
  approvalStatus: MaterialApprovalStatus;
  notes: string | null;
  approvalNote: string | null;
  rejectionReason: string | null;
  metadata: Record<string, unknown> | null;
  recordedBy: { id: string; name?: string | null } | null;
  approver: { id: string; name?: string | null } | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
}

@Injectable()
export class MaterialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

  async list(jobId: string, query: ListMaterialsDto): Promise<MaterialSummary[]> {
    const tenantId = this.prisma.getTenantIdOrThrow();

    const where: Prisma.MaterialUsageWhereInput = {
      tenantId,
      jobId,
    };

    if (query.status) {
      where.approvalStatus = query.status;
    }

    if (query.search) {
      const term = query.search.trim();
      if (term.length) {
        where.OR = [
          { sku: { contains: term, mode: 'insensitive' } },
          { costCode: { contains: term, mode: 'insensitive' } },
          { notes: { contains: term, mode: 'insensitive' } },
        ];
      }
    }

    const entries = await this.prisma.materialUsage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        recordedBy: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true, email: true } },
      },
    });

    return entries.map((entry) => this.toSummary(entry));
  }

  async create(jobId: string, dto: CreateMaterialDto): Promise<MaterialSummary> {
    const tenantId = this.prisma.getTenantIdOrThrow();
    await this.ensureJobExists(jobId, tenantId);
    const recordedById = this.resolveUserId(dto.recordedById);

    const metadata = dto.metadata ? { ...dto.metadata } : undefined;

    const data: any = {
      tenantId,
      jobId,
      sku: dto.sku,
      costCode: dto.costCode ?? null,
      quantity: new Prisma.Decimal(dto.quantity),
      unitCost: new Prisma.Decimal(dto.unitCost),
      notes: dto.notes ?? null,
      metadata,
      recordedById,
      approvalStatus: MaterialApprovalStatus.SUBMITTED,
      rejectionReason: null,
    };

    const entry = await this.prisma.materialUsage.create({
      data,
      include: {
        recordedBy: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true, email: true } },
      },
    });

    return this.toSummary(entry);
  }

  async update(jobId: string, entryId: string, dto: UpdateMaterialDto): Promise<MaterialSummary> {
    const tenantId = this.prisma.getTenantIdOrThrow();

    const existing = await this.prisma.materialUsage.findFirst({
      where: {
        id: entryId,
        jobId,
        tenantId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Material entry not found');
    }

    const update: any = {};

    if (dto.sku !== undefined) {
      update.sku = dto.sku;
    }
    if (dto.costCode !== undefined) {
      update.costCode = dto.costCode;
    }
    if (dto.quantity !== undefined) {
      update.quantity = new Prisma.Decimal(dto.quantity);
    }
    if (dto.unitCost !== undefined) {
      update.unitCost = new Prisma.Decimal(dto.unitCost);
    }
    if (dto.notes !== undefined) {
      update.notes = dto.notes ?? null;
    }

    let metadataValue: Record<string, unknown> | null | undefined;
    if (dto.metadata !== undefined) {
      metadataValue = dto.metadata ? { ...dto.metadata } : null;
    }

    if (Object.keys(update).length > 0) {
      update.approvalStatus = MaterialApprovalStatus.SUBMITTED;
      update.approverId = null;
      update.approvedAt = null;
      update.rejectionReason = null;
      if (metadataValue === undefined) {
        metadataValue = this.applyApprovalNote(existing.metadata, null);
      }
    }

    if (metadataValue !== undefined) {
      update.metadata = metadataValue;
    }

    const entry = await this.prisma.materialUsage.update({
      where: { id: entryId },
      data: update,
      include: {
        recordedBy: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true, email: true } },
      },
    });

    return this.toSummary(entry);
  }

  async approve(jobId: string, entryId: string, dto: ApproveMaterialDto): Promise<MaterialSummary> {
    const tenantId = this.prisma.getTenantIdOrThrow();
    const approverId = this.resolveUserId(dto.approverId);

    const existing = await this.prisma.materialUsage.findFirst({
      where: {
        id: entryId,
        jobId,
        tenantId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Material entry not found');
    }

    if ((existing as any).approvalStatus === MaterialApprovalStatus.APPROVED) {
      throw new BadRequestException('Material entry already approved');
    }

    const metadataValue = this.applyApprovalNote(existing.metadata, dto.note ?? null);

    const data: any = {
      approvalStatus: MaterialApprovalStatus.APPROVED,
      approverId,
      approvedAt: new Date(),
      rejectionReason: null,
    };

    if (metadataValue !== undefined) {
      data.metadata = metadataValue;
    }

    const entry = await this.prisma.materialUsage.update({
      where: { id: entryId },
      data,
      include: {
        recordedBy: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true, email: true } },
      },
    });

    return this.toSummary(entry);
  }

  async reject(jobId: string, entryId: string, dto: RejectMaterialDto): Promise<MaterialSummary> {
    const tenantId = this.prisma.getTenantIdOrThrow();
    const approverId = this.resolveUserId(dto.approverId);

    const existing = await this.prisma.materialUsage.findFirst({
      where: {
        id: entryId,
        jobId,
        tenantId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Material entry not found');
    }

    const metadataValue = this.applyApprovalNote(existing.metadata, dto.note ?? null);

    const data: any = {
      approvalStatus: MaterialApprovalStatus.REJECTED,
      approverId,
      approvedAt: null,
      rejectionReason: dto.reason,
    };

    if (metadataValue !== undefined) {
      data.metadata = metadataValue;
    }

    const entry = await this.prisma.materialUsage.update({
      where: { id: entryId },
      data,
      include: {
        recordedBy: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true, email: true } },
      },
    });

    return this.toSummary(entry);
  }

  private async ensureJobExists(jobId: string, tenantId: string): Promise<void> {
    const job = await this.prisma.job.findFirst({
      where: {
        id: jobId,
        tenantId,
        status: {
          not: JobStatus.CANCELED,
        },
      },
      select: { id: true },
    });

    if (!job) {
      throw new BadRequestException('Job not found');
    }
  }

  private resolveUserId(explicitUserId?: string): string {
    const resolved = explicitUserId ?? this.requestContext.context.userId ?? undefined;
    if (!resolved) {
      throw new BadRequestException('User identity is required for this action.');
    }
    return resolved;
  }

  private toSummary(entry: any): MaterialSummary {
    const metadata = this.normalizeMetadata(entry.metadata);
    let approvalNote: string | null = null;
    let metadataWithoutNote: Record<string, unknown> | null = metadata;

    if (metadata && typeof metadata.approvalNote === 'string') {
      approvalNote = metadata.approvalNote as string;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { approvalNote: _removed, ...rest } = metadata;
      metadataWithoutNote = Object.keys(rest).length ? rest : null;
    }

    const quantity = this.decimalToNumber(entry.quantity, 2);
    const unitCost = this.decimalToNumber(entry.unitCost, 2);
    const totalCost = this.roundToPrecision(quantity * unitCost);

    return {
      id: entry.id,
      jobId: entry.jobId,
      sku: entry.sku,
      costCode: entry.costCode ?? null,
      quantity,
      unitCost,
      totalCost,
      approvalStatus: entry.approvalStatus ?? MaterialApprovalStatus.SUBMITTED,
      notes: entry.notes ?? null,
      approvalNote,
      rejectionReason: entry.rejectionReason ?? null,
      metadata: metadataWithoutNote,
      recordedBy: entry.recordedBy
        ? { id: entry.recordedBy.id, name: entry.recordedBy.name ?? entry.recordedBy.email ?? undefined }
        : null,
      approver: entry.approver
        ? { id: entry.approver.id, name: entry.approver.name ?? entry.approver.email ?? undefined }
        : null,
      createdAt: entry.createdAt instanceof Date ? entry.createdAt.toISOString() : new Date(entry.createdAt).toISOString(),
      updatedAt: entry.updatedAt instanceof Date ? entry.updatedAt.toISOString() : new Date(entry.updatedAt).toISOString(),
      approvedAt: entry.approvedAt ? new Date(entry.approvedAt).toISOString() : null,
    };
  }

  private applyApprovalNote(
    existing: unknown,
    note: string | null | undefined,
  ): Record<string, unknown> | null | undefined {
    if (note === undefined) {
      return undefined;
    }

    const base = this.normalizeMetadata(existing);

    if (note === null || !note.trim()) {
      if (!base || !('approvalNote' in base)) {
        return base ? { ...base } : undefined;
      }
      const { approvalNote: _removed, ...rest } = base;
      return Object.keys(rest).length ? rest : null;
    }

    return { ...(base ?? {}), approvalNote: note.trim() };
  }

  private decimalToNumber(value: unknown, precision = 2): number {
    if (value === null || value === undefined) {
      return 0;
    }

    if (typeof value === 'number') {
      return this.roundToPrecision(value, precision);
    }

    if (value instanceof Prisma.Decimal) {
      return this.roundToPrecision(value.toNumber(), precision);
    }

    if (typeof (value as { toNumber?: () => number }).toNumber === 'function') {
      return this.roundToPrecision(
        (value as { toNumber: () => number }).toNumber(),
        precision,
      );
    }

    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      return 0;
    }

    return this.roundToPrecision(parsed, precision);
  }

  private roundToPrecision(value: number, precision = 2): number {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
  }

  private normalizeMetadata(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return { ...(value as Record<string, unknown>) };
  }
}
