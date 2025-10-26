import { BadRequestException, Injectable } from '@nestjs/common';
import { EstimateStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContextService } from '../context/request-context.service';
import { ListEstimatesDto } from './dto/list-estimates.dto';
import { CreateEstimateDto } from './dto/create-estimate.dto';
import { UpdateEstimateDto } from './dto/update-estimate.dto';
import { SendEstimateDto } from './dto/send-estimate.dto';
import { ApproveEstimateDto } from './dto/approve-estimate.dto';
import { EstimateMailerService } from './estimate-mailer.service';

type EstimateWithRelations = Prisma.EstimateGetPayload<{
  include: {
    lead: {
      select: {
        id: true;
        stage: true;
        contact: { select: { name: true } };
      };
    };
    lineItems: true;
    approvals: true;
    job: {
      select: {
        id: true;
        status: true;
        scheduledStart: true;
      };
    };
  };
}>;

export interface EstimateSummary {
  id: string;
  number: string;
  status: EstimateStatus;
  subtotal: number;
  tax: number;
  total: number;
  expiresAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  lead: {
    id: string;
    stage: string;
    contactName?: string | null;
  };
  lineItems: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  approvals: number;
  latestApproval: EstimateApprovalSnapshot | null;
  approvalHistory: EstimateApprovalSnapshot[];
  job?: {
    id: string;
    status: EstimateStatus | string;
    scheduledStart?: string | null;
  };
}

export interface EstimateApprovalSnapshot {
  id: string;
  status: EstimateStatus;
  approvedAt?: string | null;
  createdAt: string;
  recipientEmail?: string | null;
  recipientName?: string | null;
  approverName?: string | null;
  approverEmail?: string | null;
  message?: string | null;
  emailSubject?: string | null;
}

@Injectable()
export class EstimatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
    private readonly estimateMailer: EstimateMailerService,
  ) {}

  async list(params: ListEstimatesDto): Promise<EstimateSummary[]> {
    const where: Prisma.EstimateWhereInput = {};
    const take = params.take ?? 25;

    if (params.leadId) {
      where.leadId = params.leadId;
    }

    if (params.status) {
      where.status = params.status;
    }

    if (params.search) {
      const search = params.search.trim();
      if (search.length) {
        where.OR = [
          { number: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
          {
            lead: {
              contact: {
                name: { contains: search, mode: 'insensitive' },
              },
            },
          },
        ];
      }
    }

    if (params.expiresBefore) {
      where.expiresAt = {
        lte: new Date(params.expiresBefore),
      };
    }

    const estimates = await this.prisma.estimate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        lead: {
          select: {
            id: true,
            stage: true,
            contact: { select: { name: true } },
          },
        },
        lineItems: true,
        approvals: true,
        job: {
          select: {
            id: true,
            status: true,
            scheduledStart: true,
          },
        },
      },
    });

    return estimates.map((estimate) => this.toSummary(estimate));
  }

  async findOne(id: string): Promise<EstimateSummary> {
    const estimate = await this.prisma.estimate.findFirst({
      where: { id },
      include: {
        lead: {
          select: {
            id: true,
            stage: true,
            contact: { select: { name: true } },
          },
        },
        lineItems: true,
        approvals: true,
        job: {
          select: {
            id: true,
            status: true,
            scheduledStart: true,
          },
        },
      },
    });

    if (!estimate) {
      throw new BadRequestException('Estimate not found');
    }

    return this.toSummary(estimate);
  }

  async create(dto: CreateEstimateDto): Promise<EstimateSummary> {
    if (!dto.lineItems?.length) {
      throw new BadRequestException('At least one line item is required');
    }

    const tenantId = this.prisma.getTenantIdOrThrow();
    const number = dto.number ?? this.generateEstimateNumber();

    const totals = calculateTotals(dto.lineItems);

    const estimate = await this.prisma.estimate.create({
      data: {
        tenant: { connect: { id: tenantId } },
        lead: { connect: { id: dto.leadId } },
        number,
        status: dto.status ?? EstimateStatus.DRAFT,
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        notes: dto.notes,
        lineItems: {
          create: dto.lineItems.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        },
      },
      include: {
        lead: {
          select: {
            id: true,
            stage: true,
            contact: { select: { name: true } },
          },
        },
        lineItems: true,
        approvals: true,
        job: {
          select: {
            id: true,
            status: true,
            scheduledStart: true,
          },
        },
      },
    });

    await this.logLeadActivity(tenantId, dto.leadId, 'lead.estimate_created', {
      estimateId: estimate.id,
      status: estimate.status,
    });

    return this.toSummary(estimate);
  }

  async update(id: string, dto: UpdateEstimateDto): Promise<EstimateSummary> {
    const data: Prisma.EstimateUpdateInput = {};
    const tenantId = this.prisma.getTenantIdOrThrow();

    const existing = await this.prisma.estimate.findUnique({
      where: { id },
      select: {
        status: true,
        leadId: true,
      },
    });

    if (!existing) {
      throw new BadRequestException('Estimate not found');
    }

    if (dto.status) data.status = dto.status;
    if (dto.expiresAt !== undefined) {
      data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    }
    if (dto.notes !== undefined) data.notes = dto.notes;

    if (dto.lineItems) {
      if (!dto.lineItems.length) {
        throw new BadRequestException('Line items cannot be empty');
      }
      const totals = calculateTotals(dto.lineItems);
      data.subtotal = totals.subtotal;
      data.tax = totals.tax;
      data.total = totals.total;
      data.lineItems = {
        deleteMany: {},
        create: dto.lineItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      };
    }

    const estimate = await this.prisma.estimate.update({
      where: { id },
      data,
      include: {
        lead: {
          select: {
            id: true,
            stage: true,
            contact: { select: { name: true } },
          },
        },
        lineItems: true,
        approvals: true,
        job: {
          select: {
            id: true,
            status: true,
            scheduledStart: true,
          },
        },
      },
    });

    const leadId = estimate.lead.id ?? existing.leadId;
    if (leadId) {
      if (dto.status && dto.status !== existing.status) {
        await this.logLeadActivity(tenantId, leadId, 'lead.estimate_status_updated', {
          estimateId: estimate.id,
          from: existing.status,
          to: dto.status,
        });
      } else if (
        dto.notes !== undefined ||
        dto.lineItems ||
        dto.expiresAt !== undefined
      ) {
        await this.logLeadActivity(tenantId, leadId, 'lead.estimate_updated', {
          estimateId: estimate.id,
        });
      }
    }

    return this.toSummary(estimate);
  }

  async remove(id: string): Promise<void> {
    await this.prisma.estimate.delete({
      where: { id },
    });
  }

  async send(id: string, dto: SendEstimateDto): Promise<EstimateSummary> {
    const tenantId = this.prisma.getTenantIdOrThrow();
    const estimate = await this.prisma.estimate.findFirst({
      where: { id, tenantId },
      include: {
        lead: {
          select: {
            id: true,
            contact: {
              select: {
                name: true,
              },
            },
          },
        },
        lineItems: true,
      },
    });

    if (!estimate) {
      throw new BadRequestException('Estimate not found');
    }

    const emailResult = await this.estimateMailer.sendEstimateEmail(
      {
        id: estimate.id,
        number: estimate.number,
        status: estimate.status,
        subtotal: estimate.subtotal,
        tax: estimate.tax,
        total: estimate.total,
        lead: {
          contact: {
            name: estimate.lead.contact?.name ?? null,
          },
        },
        lineItems: estimate.lineItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      },
      dto,
    );

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.estimate.update({
        where: { id },
        data: {
          status: EstimateStatus.SENT,
        },
      });

      await tx.estimateApproval.create({
        data: {
          estimateId: id,
          status: EstimateStatus.SENT,
          signature: {
            event: 'sent',
            recipientEmail: dto.recipientEmail,
            recipientName: dto.recipientName ?? null,
            message: dto.message ?? null,
            subject: emailResult.subject,
            htmlPreview: emailResult.htmlPreview,
            sentAt: now.toISOString(),
          } as Prisma.JsonObject,
        },
      });
    });

    await this.logLeadActivity(tenantId, estimate.lead.id, 'lead.estimate_sent', {
      estimateId: id,
      status: EstimateStatus.SENT,
      recipientEmail: dto.recipientEmail,
      subject: emailResult.subject,
    });

    return this.getSummaryById(id, tenantId);
  }

  async approve(id: string, dto: ApproveEstimateDto): Promise<EstimateSummary> {
    const tenantId = this.prisma.getTenantIdOrThrow();
    const estimate = await this.prisma.estimate.findFirst({
      where: { id, tenantId },
      include: {
        lead: { select: { id: true } },
      },
    });

    if (!estimate) {
      throw new BadRequestException('Estimate not found');
    }

    const approvedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.estimateApproval.create({
        data: {
          estimateId: id,
          status: EstimateStatus.APPROVED,
          approvedAt,
          signature: {
            event: 'approved',
            approverName: dto.approverName,
            approverEmail: dto.approverEmail ?? null,
            signature: dto.signature ?? null,
            approvedAt: approvedAt.toISOString(),
          } as Prisma.JsonObject,
        },
      });

      await tx.estimate.update({
        where: { id },
        data: {
          status: EstimateStatus.APPROVED,
        },
      });
    });

    await this.logLeadActivity(tenantId, estimate.lead.id, 'lead.estimate_approved', {
      estimateId: id,
      status: EstimateStatus.APPROVED,
      approverName: dto.approverName,
      approverEmail: dto.approverEmail ?? null,
    });

    return this.getSummaryById(id, tenantId);
  }

  private toSummary(estimate: EstimateWithRelations): EstimateSummary {
    const approvalHistory = this.mapApprovals(estimate.approvals);
    const latestApproval = approvalHistory.length > 0 ? approvalHistory[0] : null;

    return {
      id: estimate.id,
      number: estimate.number,
      status: estimate.status,
      subtotal: Number(estimate.subtotal),
      tax: Number(estimate.tax),
      total: Number(estimate.total),
      expiresAt: estimate.expiresAt?.toISOString() ?? null,
      notes: estimate.notes,
      createdAt: estimate.createdAt.toISOString(),
      updatedAt: estimate.updatedAt.toISOString(),
      lead: {
        id: estimate.lead.id,
        stage: estimate.lead.stage,
        contactName: estimate.lead.contact?.name,
      },
      lineItems: estimate.lineItems.map((item) => ({
        id: item.id,
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        total: Number(item.quantity) * Number(item.unitPrice),
      })),
      approvals: estimate.approvals.length,
      latestApproval,
      approvalHistory,
      job: estimate.job
        ? {
            id: estimate.job.id,
            status: estimate.job.status,
            scheduledStart: estimate.job.scheduledStart?.toISOString() ?? null,
          }
        : undefined,
    };
  }

  private mapApprovals(
    approvals: Prisma.EstimateApprovalGetPayload<Record<string, never>>[],
  ): EstimateApprovalSnapshot[] {
    return approvals
      .map((approval) => {
        const signature = this.toRecord(approval.signature);
        const timestamp = this.resolveApprovalTimestamp(approval);
        const createdAtIso = new Date(
          timestamp || Date.now(),
        ).toISOString();

        return {
          id: approval.id,
          status: approval.status,
          approvedAt: approval.approvedAt?.toISOString() ?? null,
          createdAt: createdAtIso,
          recipientEmail: signature?.recipientEmail
            ? String(signature.recipientEmail)
            : undefined,
          recipientName: signature?.recipientName
            ? String(signature.recipientName)
            : undefined,
          approverName: signature?.approverName
            ? String(signature.approverName)
            : undefined,
          approverEmail: signature?.approverEmail
            ? String(signature.approverEmail)
            : undefined,
          message: signature?.message ? String(signature.message) : undefined,
          emailSubject: signature?.subject ? String(signature.subject) : undefined,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }

  private toRecord(
    value: Prisma.JsonValue | null | undefined,
  ): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private resolveApprovalTimestamp(
    approval: Prisma.EstimateApprovalGetPayload<Record<string, never>>,
  ): number {
    if (approval.approvedAt) {
      return approval.approvedAt.getTime();
    }
    const signature = this.toRecord(approval.signature);
    if (signature?.sentAt) {
      const parsed = Date.parse(String(signature.sentAt));
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
    if (signature?.approvedAt) {
      const parsed = Date.parse(String(signature.approvedAt));
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
    return 0;
  }

  private async getSummaryById(
    id: string,
    tenantId: string,
  ): Promise<EstimateSummary> {
    const estimate = await this.prisma.estimate.findFirst({
      where: { id, tenantId },
      include: {
        lead: {
          select: {
            id: true,
            stage: true,
            contact: { select: { name: true } },
          },
        },
        lineItems: true,
        approvals: true,
        job: {
          select: {
            id: true,
            status: true,
            scheduledStart: true,
          },
        },
      },
    });

    if (!estimate) {
      throw new BadRequestException('Estimate not found');
    }

    return this.toSummary(estimate);
  }

  private generateEstimateNumber(): string {
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, '')
      .slice(0, 12);
    return `EST-${timestamp}`;
  }

  private async logLeadActivity(
    tenantId: string,
    leadId: string,
    action: string,
    meta?: Record<string, unknown>,
  ) {
    const actorId = this.requestContext.context.userId;
    await this.prisma.activityLog.create({
      data: {
        tenantId,
        actorId,
        action,
        entityType: 'lead',
        entityId: leadId,
        meta: meta ? (meta as Prisma.JsonValue) : undefined,
      },
    });
  }
}

function calculateTotals(
  items: Array<{ quantity: number; unitPrice: number }>,
): { subtotal: Prisma.Decimal; tax: Prisma.Decimal; total: Prisma.Decimal } {
  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );
  const tax = subtotal * 0.0825; // placeholder 8.25% tax, will be configurable
  const total = subtotal + tax;

  return {
    subtotal: new Prisma.Decimal(subtotal),
    tax: new Prisma.Decimal(tax),
    total: new Prisma.Decimal(total),
  };
}

