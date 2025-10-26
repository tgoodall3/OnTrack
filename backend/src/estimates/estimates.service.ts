import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { EstimateStatus, FileType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContextService } from '../context/request-context.service';
import { ListEstimatesDto } from './dto/list-estimates.dto';
import { CreateEstimateDto } from './dto/create-estimate.dto';
import { UpdateEstimateDto } from './dto/update-estimate.dto';
import { SendEstimateDto } from './dto/send-estimate.dto';
import { ApproveEstimateDto } from './dto/approve-estimate.dto';
import { EstimateMailerService } from './estimate-mailer.service';
import { StorageService } from '../storage/storage.service';
import PDFDocument from 'pdfkit';

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
    template: {
      select: {
        id: true;
        name: true;
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
  template?: {
    id: string;
    name: string;
  } | null;
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
  private readonly logger = new Logger(EstimatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
    private readonly storage: StorageService,
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
        template: { select: { id: true, name: true } },
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
        template: { select: { id: true, name: true } },
      },
    });

    if (!estimate) {
      throw new BadRequestException('Estimate not found');
    }

    return this.toSummary(estimate);
  }

  async create(dto: CreateEstimateDto): Promise<EstimateSummary> {
    const tenantId = this.prisma.getTenantIdOrThrow();
    const number = dto.number ?? this.generateEstimateNumber();

    let template:
      | Prisma.EstimateTemplateGetPayload<{
          include: { items: { orderBy: { order: 'asc' } } };
        }>
      | null = null;

    if (dto.templateId) {
      template = await this.prisma.estimateTemplate.findFirst({
        where: {
          id: dto.templateId,
          tenantId,
          isArchived: false,
        },
        include: {
          items: { orderBy: { order: 'asc' } },
        },
      });

      if (!template) {
        throw new BadRequestException('Estimate template not found');
      }
    }

    const manualLineItems = dto.lineItems ?? [];
    let lineItems = manualLineItems;

    if (!manualLineItems.length && template) {
      lineItems = template.items.map((item) => ({
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
      }));
    }

    if (!lineItems.length) {
      throw new BadRequestException(
        'At least one line item or a valid template is required',
      );
    }

    const totals = calculateTotals(lineItems);

    const estimate = await this.prisma.estimate.create({
      data: {
        tenant: { connect: { id: tenantId } },
        lead: { connect: { id: dto.leadId } },
        number,
        template: template ? { connect: { id: template.id } } : undefined,
        status: dto.status ?? EstimateStatus.DRAFT,
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        notes: dto.notes,
        lineItems: {
          create: lineItems.map((item) => ({
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
        template: { select: { id: true, name: true } },
      },
    });

    await this.logLeadActivity(tenantId, dto.leadId, 'lead.estimate_created', {
      estimateId: estimate.id,
      status: estimate.status,
      templateId: template?.id ?? null,
    });

    return this.toSummary(estimate);
  }

  async update(id: string, dto: UpdateEstimateDto): Promise<EstimateSummary> {
    const tenantId = this.prisma.getTenantIdOrThrow();

    const existing = await this.prisma.estimate.findUnique({
      where: { id },
      select: {
        status: true,
        leadId: true,
        templateId: true,
      },
    });

    if (!existing) {
      throw new BadRequestException('Estimate not found');
    }

    const data: Prisma.EstimateUpdateInput = {};
    let template:
      | Prisma.EstimateTemplateGetPayload<{
          include: { items: { orderBy: { order: 'asc' } } };
        }>
      | null = null;

    if (dto.templateId !== undefined) {
      const trimmed = dto.templateId.trim();
      if (trimmed.length > 0) {
        template = await this.prisma.estimateTemplate.findFirst({
          where: { id: trimmed, tenantId, isArchived: false },
          include: { items: { orderBy: { order: 'asc' } } },
        });

        if (!template) {
          throw new BadRequestException('Estimate template not found');
        }

        data.template = { connect: { id: template.id } };
      } else {
        data.template = { disconnect: true };
      }
    }

    if (dto.status) {
      data.status = dto.status;
    }

    if (dto.expiresAt !== undefined) {
      data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    }

    if (dto.notes !== undefined) {
      data.notes = dto.notes;
    }

    let replacementLineItems:
      | Array<{
          description: string;
          quantity: number;
          unitPrice: number;
        }>
      | undefined;

    if (dto.lineItems) {
      if (!dto.lineItems.length) {
        throw new BadRequestException('Line items cannot be empty');
      }

      replacementLineItems = dto.lineItems.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      }));
    } else if (template) {
      replacementLineItems = template.items.map((item) => ({
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
      }));
    }

    if (replacementLineItems) {
      const totals = calculateTotals(replacementLineItems);
      data.subtotal = totals.subtotal;
      data.tax = totals.tax;
      data.total = totals.total;
      data.lineItems = {
        deleteMany: {},
        create: replacementLineItems.map((item) => ({
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
        template: { select: { id: true, name: true } },
      },
    });

    const leadId = estimate.lead.id ?? existing.leadId;
    if (leadId) {
      if (dto.status && dto.status !== existing.status) {
        await this.logLeadActivity(
          tenantId,
          leadId,
          'lead.estimate_status_updated',
          {
            estimateId: estimate.id,
            from: existing.status,
            to: dto.status,
          },
        );
      } else if (
        dto.notes !== undefined ||
        dto.lineItems ||
        dto.expiresAt !== undefined ||
        dto.templateId !== undefined
      ) {
        await this.logLeadActivity(tenantId, leadId, 'lead.estimate_updated', {
          estimateId: estimate.id,
          templateId: estimate.template?.id ?? null,
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
        template: { select: { id: true, name: true } },
      },
    });

    if (!estimate) {
      throw new BadRequestException('Estimate not found');
    }

    const now = new Date();
    let pdfAttachment:
      | {
          buffer: Buffer;
          fileName: string;
        }
      | null = null;

    try {
      const pdfReadySummary: EstimateSummary = {
        ...this.toSummary(estimate),
        status: EstimateStatus.SENT,
      };
      const buffer = await this.generateEstimatePdf(pdfReadySummary);
      const timestamp = now.toISOString().replace(/[-:T.Z]/g, '');
      pdfAttachment = {
        buffer,
        fileName: `estimate-${estimate.number}-${timestamp}.pdf`,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to prepare estimate PDF for ${id}: ${String(
          (error as Error)?.message ?? error,
        )}`,
      );
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
      pdfAttachment ? { pdf: pdfAttachment } : undefined,
    );

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

    const summary = await this.getSummaryById(id, tenantId);

    let pdfFileId: string | null = null;
    if (pdfAttachment) {
      try {
        const storageKey = `tenants/${tenantId}/estimates/${summary.id}/${pdfAttachment.fileName}`;

        await this.storage.uploadObject(
          storageKey,
          pdfAttachment.buffer,
          'application/pdf',
        );

        const fileRecord = await this.prisma.file.create({
          data: {
            tenant: { connect: { id: tenantId } },
            estimate: { connect: { id: summary.id } },
            url: this.storage.resolvePublicUrl(storageKey),
            type: FileType.DOCUMENT,
            metadata: {
              key: storageKey,
              fileName: pdfAttachment.fileName,
              mimeType: 'application/pdf',
              fileSize: pdfAttachment.buffer.length,
            } as Prisma.JsonObject,
            uploadedBy: this.requestContext.context.userId
              ? { connect: { id: this.requestContext.context.userId } }
              : undefined,
          },
        });

        pdfFileId = fileRecord.id;
      } catch (error) {
        this.logger.warn(
          `Failed to persist estimate PDF for ${id}: ${String(
            (error as Error)?.message ?? error,
          )}`,
        );
      }
    }

    await this.logLeadActivity(tenantId, summary.lead.id, 'lead.estimate_sent', {
      estimateId: id,
      status: EstimateStatus.SENT,
      recipientEmail: dto.recipientEmail,
      subject: emailResult.subject,
      pdfFileId,
    });

    return summary;
  }

  private async generateEstimatePdf(summary: EstimateSummary): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (error) => reject(error));

      doc.fontSize(20).text(`Estimate ${summary.number}`, { align: 'left' });
      doc.moveDown();

      doc.fontSize(12).text(`Status: ${summary.status}`);
      doc.text(`Created: ${this.formatDisplayDate(summary.createdAt)}`);
      doc.text(
        `Expires: ${summary.expiresAt ? this.formatDisplayDate(summary.expiresAt) : 'Not set'}`,
      );
      doc.text(`Customer: ${summary.lead.contactName ?? 'Customer'}`);
      doc.text(`Template: ${summary.template?.name ?? 'Manual entry'}`);
      doc.moveDown();

      doc.fontSize(14).text('Line Items', { underline: true });
      doc.moveDown(0.5);

      summary.lineItems.forEach((item, index) => {
        doc
          .fontSize(12)
          .text(`${index + 1}. ${item.description}`, { continued: false });
        doc
          .fontSize(10)
          .text(
            `   Qty: ${item.quantity}   Unit: ${this.formatCurrency(item.unitPrice)}   Total: ${this.formatCurrency(item.total)}`,
          );
        doc.moveDown(0.5);
      });

      doc.moveDown();
      doc.fontSize(12).text(`Subtotal: ${this.formatCurrency(summary.subtotal)}`);
      doc.text(`Tax: ${this.formatCurrency(summary.tax)}`);
      doc.text(`Total: ${this.formatCurrency(summary.total)}`);

      if (summary.notes?.trim()) {
        doc.moveDown();
        doc.fontSize(12).text('Notes', { underline: true });
        doc.moveDown(0.25);
        doc.fontSize(11).text(summary.notes);
      }

      doc.end();
    });
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

    await this.logLeadActivity(
      tenantId,
      estimate.lead.id,
      'lead.estimate_approved',
      {
        estimateId: id,
        status: EstimateStatus.APPROVED,
        approverName: dto.approverName,
        approverEmail: dto.approverEmail ?? null,
      },
    );

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
      template: estimate.template
        ? {
            id: estimate.template.id,
            name: estimate.template.name,
          }
        : null,
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
        const createdAtIso = new Date(timestamp || Date.now()).toISOString();

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
        template: { select: { id: true, name: true } },
      },
    });

    if (!estimate) {
      throw new BadRequestException('Estimate not found');
    }

    return this.toSummary(estimate);
  }

  private generateEstimateNumber(): string {
    const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 12);
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

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  }

  private formatDisplayDate(iso: string): string {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(iso));
  }
}

export function calculateTotals(
  items: Array<{ quantity: number; unitPrice: number }>,
): {
  subtotal: Prisma.Decimal;
  tax: Prisma.Decimal;
  total: Prisma.Decimal;
} {
  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );
  const tax = subtotal * 0.0825; // TODO: expose configurable tax rate
  const total = subtotal + tax;

  return {
    subtotal: new Prisma.Decimal(subtotal),
    tax: new Prisma.Decimal(tax),
    total: new Prisma.Decimal(total),
  };
}
