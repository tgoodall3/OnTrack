import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChecklistTemplateDto } from './dto/create-template.dto';

type ChecklistTemplateWithItems = Prisma.ChecklistTemplateGetPayload<{
  include: {
    items: true;
  };
}>;

export interface ChecklistTemplateSummary {
  id: string;
  name: string;
  description?: string | null;
  items: Array<{
    id: string;
    title: string;
    order: number;
  }>;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class ChecklistsService {
  constructor(private readonly prisma: PrismaService) {}

  async listTemplates(): Promise<ChecklistTemplateSummary[]> {
    const tenantId = this.prisma.getTenantIdOrThrow();

    const templates = await this.prisma.checklistTemplate.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          orderBy: { order: 'asc' },
        },
      },
    });

    return templates.map((template) => this.toSummary(template));
  }

  async createTemplate(dto: CreateChecklistTemplateDto): Promise<ChecklistTemplateSummary> {
    const tenantId = this.prisma.getTenantIdOrThrow();

    const existing = await this.prisma.checklistTemplate.findFirst({
      where: {
        tenantId,
        name: dto.name.trim(),
      },
    });

    if (existing) {
      throw new BadRequestException('A template with this name already exists.');
    }

    const template = await this.prisma.checklistTemplate.create({
      data: {
        tenant: { connect: { id: tenantId } },
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        items: {
          create: dto.items.map((item, index) => ({
            title: item.title.trim(),
            order: index,
          })),
        },
      },
      include: {
        items: {
          orderBy: { order: 'asc' },
        },
      },
    });

    return this.toSummary(template);
  }

  async applyTemplate(templateId: string, jobId: string): Promise<void> {
    const tenantId = this.prisma.getTenantIdOrThrow();

    const template = await this.prisma.checklistTemplate.findFirst({
      where: { id: templateId, tenantId },
      include: {
        items: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!template) {
      throw new BadRequestException('Checklist template not found');
    }

    const job = await this.prisma.job.findFirst({
      where: { id: jobId, tenantId },
      select: { id: true },
    });

    if (!job) {
      throw new BadRequestException('Job not found');
    }

    if (!template.items.length) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const existingTasks = await tx.task.findMany({
        where: {
          jobId,
          checklistTemplateId: templateId,
        },
        select: { id: true },
      });

      if (existingTasks.length) {
        await tx.task.deleteMany({
          where: {
            jobId,
            checklistTemplateId: templateId,
          },
        });
      }

      await tx.task.createMany({
        data: template.items.map((item) => ({
          tenantId,
          jobId,
          title: item.title,
          status: 'PENDING',
          checklistTemplateId: templateId,
        })),
      });
    });
  }

  private toSummary(template: ChecklistTemplateWithItems): ChecklistTemplateSummary {
    return {
      id: template.id,
      name: template.name,
      description: template.description,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
      items: template.items
        .map((item) => ({
          id: item.id,
          title: item.title,
          order: item.order,
        }))
        .sort((a, b) => a.order - b.order),
    };
  }
}
