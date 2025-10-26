import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChecklistTemplateDto } from './dto/create-template.dto';
import { UpdateChecklistTemplateDto } from './dto/update-template.dto';
import { RequestContextService } from '../context/request-context.service';

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

export interface ChecklistTemplateActivityEntry {
  id: string;
  action: string;
  createdAt: string;
  actor?: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
  meta?: Prisma.JsonValue | null;
}

@Injectable()
export class ChecklistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

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

    const trimmedName = dto.name.trim();
    if (!trimmedName) {
      throw new BadRequestException('Template name is required.');
    }

    const existing = await this.prisma.checklistTemplate.findFirst({
      where: {
        tenantId,
        name: trimmedName,
      },
    });

    if (existing) {
      throw new BadRequestException('A template with this name already exists.');
    }

    const normalizedItems = dto.items.map((item, index) => {
      const title = item.title.trim();
      if (!title) {
        throw new BadRequestException('Checklist items require a title.');
      }

      return { title, order: index };
    });

    const template = await this.prisma.checklistTemplate.create({
      data: {
        tenant: { connect: { id: tenantId } },
        name: trimmedName,
        description: dto.description?.trim() || null,
        items: {
          create: normalizedItems,
        },
      },
      include: {
        items: {
          orderBy: { order: 'asc' },
        },
      },
    });

    await this.logTemplateActivity(tenantId, template.id, 'checklist.template_created', {
      name: template.name,
      itemCount: template.items.length,
    });

    return this.toSummary(template);
  }

  async updateTemplate(templateId: string, dto: UpdateChecklistTemplateDto): Promise<ChecklistTemplateSummary> {
    const tenantId = this.prisma.getTenantIdOrThrow();

    const template = await this.prisma.checklistTemplate.findFirst({
      where: { id: templateId, tenantId },
      include: {
        items: true,
      },
    });

    if (!template) {
      throw new BadRequestException('Checklist template not found');
    }

    const trimmedName = dto.name?.trim();
    if (dto.name !== undefined && (!trimmedName || trimmedName.length === 0)) {
      throw new BadRequestException('Template name is required.');
    }
    if (trimmedName && trimmedName !== template.name) {
      const conflicting = await this.prisma.checklistTemplate.findFirst({
        where: {
          tenantId,
          name: trimmedName,
          NOT: { id: templateId },
        },
      });

      if (conflicting) {
        throw new BadRequestException('A template with this name already exists.');
      }
    }

    const items = dto.items.map((item, index) => {
      const title = item.title.trim();
      if (!title) {
        throw new BadRequestException('Checklist items require a title.');
      }
      return {
        id: item.id,
        title,
        order: index,
      };
    });

    const itemsWithId = items.filter((item) => item.id);
    const existingItemIds = new Set(template.items.map((item) => item.id));

    for (const item of itemsWithId) {
      if (!existingItemIds.has(item.id!)) {
        throw new BadRequestException('Template item does not belong to this template');
      }
    }

    const idsToKeep = itemsWithId.map((item) => item.id!) as string[];

    const removedCount = template.items.length - idsToKeep.length;
    const addedCount = items.filter((item) => !item.id).length;
    const originalItemsById = new Map(template.items.map((item) => [item.id, item]));
    const changedExistingCount = itemsWithId.filter((item) => {
      const original = originalItemsById.get(item.id!);
      if (!original) return false;
      return original.title !== item.title || original.order !== item.order;
    }).length;

    const updatedTemplate = await this.prisma.$transaction(async (tx) => {
      if (trimmedName || dto.description !== undefined) {
        await tx.checklistTemplate.update({
          where: { id: templateId },
          data: {
            ...(trimmedName ? { name: trimmedName } : {}),
            description:
              dto.description !== undefined
                ? dto.description?.trim() || null
                : undefined,
          },
        });
      }

      if (template.items.length) {
        await tx.checklistItem.deleteMany({
          where: {
            templateId,
            id: { notIn: idsToKeep },
          },
        });
      }

      for (const item of items) {
        if (item.id) {
          await tx.checklistItem.update({
            where: { id: item.id },
            data: {
              title: item.title,
              order: item.order,
            },
          });
        } else {
          await tx.checklistItem.create({
            data: {
              templateId,
              title: item.title,
              order: item.order,
            },
          });
        }
      }

      return tx.checklistTemplate.findUniqueOrThrow({
        where: { id: templateId },
        include: {
          items: {
            orderBy: { order: 'asc' },
          },
        },
      });
    });

    await this.logTemplateActivity(tenantId, updatedTemplate.id, 'checklist.template_updated', {
      nameChanged: trimmedName && trimmedName !== template.name,
      descriptionChanged:
        dto.description !== undefined
          ? (dto.description?.trim() || null) !== (template.description ?? null)
          : false,
      addedItemCount: addedCount,
      removedItemCount: Math.max(removedCount, 0),
      modifiedItemCount: changedExistingCount,
      totalItems: updatedTemplate.items.length,
    });

    return this.toSummary(updatedTemplate);
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
      await tx.task.deleteMany({
        where: {
          jobId,
          checklistTemplateId: { not: null },
        },
      });

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

    await this.logJobActivity(tenantId, jobId, 'job.checklist_template_applied', {
      templateId,
      templateName: template.name,
    });
  }

  async removeTemplate(templateId: string, jobId: string): Promise<void> {
    const tenantId = this.prisma.getTenantIdOrThrow();

    const template = await this.prisma.checklistTemplate.findFirst({
      where: { id: templateId, tenantId },
      select: { id: true, name: true },
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

    await this.prisma.task.deleteMany({
      where: {
        jobId,
        checklistTemplateId: templateId,
      },
    });

    await this.logJobActivity(tenantId, jobId, 'job.checklist_template_removed', {
      templateId,
      templateName: template.name,
    });
  }

  async deleteTemplate(templateId: string): Promise<void> {
    const tenantId = this.prisma.getTenantIdOrThrow();

    const template = await this.prisma.checklistTemplate.findFirst({
      where: { id: templateId, tenantId },
      select: { id: true, name: true },
    });

    if (!template) {
      throw new BadRequestException('Checklist template not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.task.deleteMany({
        where: {
          checklistTemplateId: templateId,
          tenantId,
        },
      });

      await tx.checklistTemplate.delete({
        where: { id: templateId },
      });
    });

    await this.logTemplateActivity(tenantId, templateId, 'checklist.template_deleted', {
      name: template.name,
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

  private async logTemplateActivity(
    tenantId: string,
    templateId: string,
    action: string,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    const actorId = this.requestContext.context.userId;
    await this.prisma.activityLog.create({
      data: {
        tenantId,
        actorId,
        action,
        entityType: 'checklist_template',
        entityId: templateId,
        meta: meta ? (meta as Prisma.JsonValue) : undefined,
      },
    });
  }

  async templateActivity(templateId: string): Promise<ChecklistTemplateActivityEntry[]> {
    const tenantId = this.prisma.getTenantIdOrThrow();
    const logs = await this.prisma.activityLog.findMany({
      where: {
        tenantId,
        entityType: 'checklist_template',
        entityId: templateId,
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return logs.map((log) => ({
      id: log.id,
      action: log.action,
      createdAt: log.createdAt.toISOString(),
      actor: log.actor
        ? {
            id: log.actor.id,
            name: log.actor.name,
            email: log.actor.email,
          }
        : undefined,
      meta: log.meta ?? null,
    }));
  }

  private async logJobActivity(
    tenantId: string,
    jobId: string,
    action: string,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    const actorId = this.requestContext.context.userId;
    await this.prisma.activityLog.create({
      data: {
        tenantId,
        actorId,
        action,
        entityType: 'job',
        entityId: jobId,
        meta: meta ? (meta as Prisma.JsonValue) : undefined,
      },
    });
  }
}
