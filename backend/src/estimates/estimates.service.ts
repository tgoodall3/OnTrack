import { BadRequestException, Injectable } from '@nestjs/common';
import { EstimateStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListEstimatesDto } from './dto/list-estimates.dto';
import { CreateEstimateDto } from './dto/create-estimate.dto';
import { UpdateEstimateDto } from './dto/update-estimate.dto';

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
  job?: {
    id: string;
    status: EstimateStatus | string;
    scheduledStart?: string | null;
  };
}

@Injectable()
export class EstimatesService {
  constructor(private readonly prisma: PrismaService) {}

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

    return this.toSummary(estimate);
  }

  async update(id: string, dto: UpdateEstimateDto): Promise<EstimateSummary> {
    const data: Prisma.EstimateUpdateInput = {};

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

    return this.toSummary(estimate);
  }

  async remove(id: string): Promise<void> {
    await this.prisma.estimate.delete({
      where: { id },
    });
  }

  private toSummary(estimate: EstimateWithRelations): EstimateSummary {
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
      job: estimate.job
        ? {
            id: estimate.job.id,
            status: estimate.job.status,
            scheduledStart: estimate.job.scheduledStart?.toISOString() ?? null,
          }
        : undefined,
    };
  }

  private generateEstimateNumber(): string {
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, '')
      .slice(0, 12);
    return `EST-${timestamp}`;
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
