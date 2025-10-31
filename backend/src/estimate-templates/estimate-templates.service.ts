
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContextService } from '../context/request-context.service';
import { CreateEstimateTemplateDto } from './dto/create-estimate-template.dto';
import { UpdateEstimateTemplateDto } from './dto/update-estimate-template.dto';
import {
  EstimateSummary,
  EstimatesService,
  calculateTotals,
} from '../estimates/estimates.service';

type EstimateTemplateWithItems = Prisma.EstimateTemplateGetPayload<{
  include: { items: { orderBy: { order: 'asc' } } };
}>;

export interface EstimateTemplateItemSummary {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  order: number;
}

export interface EstimateTemplateSummary {
  id: string;
  name: string;
  description?: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  items: EstimateTemplateItemSummary[];
}

@Injectable()
export class EstimateTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
    private readonly estimatesService: EstimatesService,
  ) {}

  async list(includeArchived = false): Promise<EstimateTemplateSummary[]> {
    const tenantId = this.prisma.getTenantIdOrThrow();
    const templates = await this.prisma.estimateTemplate.findMany({
      where: {
        tenantId,
        ...(includeArchived ? {} : { isArchived: false }),
      },
      orderBy: { createdAt: 'desc' },
      include: { items: { orderBy: { order: 'asc' } } },
    });

    return templates.map((template) => this.toSummary(template));
  }

  async findOne(id: string): Promise<EstimateTemplateSummary> {
    const tenantId = this.prisma.getTenantIdOrThrow();
    const template = await this.prisma.estimateTemplate.findFirst({
      where: { id, tenantId },
      include: { items: { orderBy: { order: 'asc' } } },
    });

    if (!template) {
      throw new BadRequestException('Estimate template not found');
    }

    return this.toSummary(template);
  }

  async create(
    dto: CreateEstimateTemplateDto,
  ): Promise<EstimateTemplateSummary> {
    const tenantId = this.prisma.getTenantIdOrThrow();

    const template = await this.prisma.estimateTemplate.create({
      data: {
        tenant: { connect: { id: tenantId } },
        name: dto.name.trim(),
        description: dto.description?.trim() || undefined,
        items: {
          create: dto.items.map((item, index) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            order: index,
          })),
        },
      },
      include: { items: { orderBy: { order: 'asc' } } },
    });

    return this.toSummary(template);
  }

  async update(
    id: string,
    dto: UpdateEstimateTemplateDto,
  ): Promise<EstimateTemplateSummary> {
    const tenantId = this.prisma.getTenantIdOrThrow();
    const existing = await this.prisma.estimateTemplate.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });

    if (!existing) {
      throw new BadRequestException('Estimate template not found');
    }

    await this.prisma.$transaction(async (tx) => {
      if (
        dto.name !== undefined ||
        dto.description !== undefined ||
        dto.isArchived !== undefined
      ) {
        await tx.estimateTemplate.update({
          where: { id },
          data: {
            name: dto.name?.trim() ?? existing.name,
            description:
              dto.description === undefined
                ? existing.description
                : dto.description?.trim() || null,
            isArchived: dto.isArchived ?? existing.isArchived,
          },
        });
      }

      if (dto.items) {
        await tx.estimateTemplateItem.deleteMany({ where: { templateId: id } });
        if (dto.items.length) {
          await tx.estimateTemplateItem.createMany({
            data: dto.items.map((item, index) => ({
              templateId: id,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              order: index,
            })),
          });
        }
      }
    });

    return this.findOne(id);
  }

  async archive(id: string): Promise<EstimateTemplateSummary> {
    return this.update(id, { isArchived: true });
  }

  async restore(id: string): Promise<EstimateTemplateSummary> {
    return this.update(id, { isArchived: false });
  }

  async remove(id: string): Promise<void> {
    const tenantId = this.prisma.getTenantIdOrThrow();

    const template = await this.prisma.estimateTemplate.findFirst({
      where: { id, tenantId },
      include: {
        items: true,
        _count: {
          select: {
            estimates: true,
          },
        },
      },
    });

    if (!template) {
      throw new BadRequestException('Estimate template not found');
    }

    if (template._count.estimates > 0) {
      throw new BadRequestException(
        'Cannot delete template while estimates are linked. Remove or archive it instead.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.estimateTemplateItem.deleteMany({
        where: { templateId: id },
      });

      await tx.estimateTemplate.delete({
        where: { id },
      });
    });
  }

  async apply(
    templateId: string,
    estimateId: string,
  ): Promise<EstimateSummary> {
    const tenantId = this.prisma.getTenantIdOrThrow();
    const template = await this.prisma.estimateTemplate.findFirst({
      where: { id: templateId, tenantId, isArchived: false },
      include: { items: { orderBy: { order: 'asc' } } },
    });

    if (!template) {
      throw new BadRequestException('Estimate template not found');
    }

    if (!template.items.length) {
      throw new BadRequestException('Template has no items to apply');
    }

    const estimate = await this.prisma.estimate.findFirst({
      where: { id: estimateId, tenantId },
      select: { id: true, leadId: true },
    });

    if (!estimate) {
      throw new BadRequestException('Estimate not found');
    }

    const lineItems = template.items.map((item) => ({
      description: item.description,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
    }));

    const totals = calculateTotals(lineItems);

    await this.prisma.$transaction(async (tx) => {
      await tx.estimateLineItem.deleteMany({
        where: { estimateId: estimate.id },
      });

      await tx.estimateLineItem.createMany({
        data: lineItems.map((item) => ({
          estimateId: estimate.id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      });

      await tx.estimate.update({
        where: { id: estimate.id },
        data: {
          templateId: template.id,
          subtotal: totals.subtotal,
          tax: totals.tax,
          total: totals.total,
        },
      });
    });

    await this.prisma.activityLog.create({
      data: {
        tenantId,
        actorId: this.requestContext.context.userId,
        action: 'lead.estimate_template_applied',
        entityType: 'lead',
        entityId: estimate.leadId,
        meta: {
          estimateId: estimate.id,
          templateId: template.id,
          templateName: template.name,
        } as Prisma.JsonObject,
      },
    });

    return this.estimatesService.findOne(estimate.id);
  }

  private toSummary(template: EstimateTemplateWithItems): EstimateTemplateSummary {
    return {
      id: template.id,
      name: template.name,
      description: template.description,
      isArchived: template.isArchived,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
      items: template.items
        .sort((a, b) => a.order - b.order)
        .map((item) => ({
          id: item.id,
          description: item.description,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          order: item.order,
        })),
    };
  }
}
