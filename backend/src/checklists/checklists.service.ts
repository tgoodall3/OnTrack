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
  isArchived: boolean;
  jobUsageCount: number;
  taskUsageCount: number;
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

export interface ChecklistTemplateUsageJob {
  jobId: string;
  jobStatus: string;
  jobLabel: string;
  taskCount: number;
  sampleTasks: Array<{
    id: string;
    title: string;
    status: string;
  }>;
}

export interface ChecklistTemplateUsage {
  template: {
    id: string;
    name: string;
  };
  totalJobs: number;
  totalTasks: number;
  jobs: ChecklistTemplateUsageJob[];
}

type TemplateUsageStats = {
  jobCount: number;
  taskCount: number;
};

@Injectable()
export class ChecklistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

  async listTemplates(includeArchived = false): Promise<ChecklistTemplateSummary[]> {
    const tenantId = this.prisma.getTenantIdOrThrow();

    const templates = await this.prisma.checklistTemplate.findMany({
      where: {
        tenantId,
        isArchived: includeArchived ? true : false,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          orderBy: { order: 'asc' },
        },
      },
    });

    const usageCounts = await this.getUsageCounts(
      tenantId,
      templates.map((template) => template.id),
    );

    return templates.map((template) =>
      this.toSummary(template, usageCounts.get(template.id)),
    );
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

    return this.toSummary(template, { jobCount: 0, taskCount: 0 });
  }

  async updateTemplate(templateId: string, dto: UpdateChecklistTemplateDto): Promise<ChecklistTemplateSummary> {
    const tenantId = this.prisma.getTenantIdOrThrow();

    const template = await this.prisma.checklistTemplate.findFirst({
      where: { id: templateId, tenantId },
      include: {
        items: true,
      },
    });

    if (!template || template.isArchived) {
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

    const usageCounts = await this.getUsageCounts(tenantId, [templateId]);

    return this.toSummary(
      updatedTemplate,
      usageCounts.get(templateId) ?? { jobCount: 0, taskCount: 0 },
    );
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

    if (template.isArchived) {
      throw new BadRequestException(
        'Cannot apply an archived checklist template',
      );
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

    const taskUsageCount = await this.prisma.task.count({
      where: {
        tenantId,
        checklistTemplateId: templateId,
      },
    });

    if (taskUsageCount > 0) {
      throw new BadRequestException(
        `Cannot delete template while ${taskUsageCount} task${taskUsageCount === 1 ? '' : 's'} are using it. Remove or reassign those tasks first.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.checklistTemplate.delete({
        where: { id: templateId },
      });
    });

    await this.logTemplateActivity(tenantId, templateId, 'checklist.template_deleted', {
      name: template.name,
    });
  }

  async archiveTemplate(templateId: string): Promise<ChecklistTemplateSummary> {
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

    if (template.isArchived) {
      const usageCounts = await this.getUsageCounts(tenantId, [templateId]);
      return this.toSummary(
        template,
        usageCounts.get(templateId) ?? { jobCount: 0, taskCount: 0 },
      );
    }

    const updated = await this.prisma.checklistTemplate.update({
      where: { id: templateId },
      data: { isArchived: true },
      include: {
        items: {
          orderBy: { order: 'asc' },
        },
      },
    });

    await this.logTemplateActivity(tenantId, templateId, 'checklist.template_archived', {
      name: template.name,
    });

    const usageCounts = await this.getUsageCounts(tenantId, [templateId]);

    return this.toSummary(
      updated,
      usageCounts.get(templateId) ?? { jobCount: 0, taskCount: 0 },
    );
  }

  async restoreTemplate(templateId: string): Promise<ChecklistTemplateSummary> {
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

    if (!template.isArchived) {
      const usageCounts = await this.getUsageCounts(tenantId, [templateId]);
      return this.toSummary(
        template,
        usageCounts.get(templateId) ?? { jobCount: 0, taskCount: 0 },
      );
    }

    const updated = await this.prisma.checklistTemplate.update({
      where: { id: templateId },
      data: { isArchived: false },
      include: {
        items: {
          orderBy: { order: 'asc' },
        },
      },
    });

    await this.logTemplateActivity(tenantId, templateId, 'checklist.template_restored', {
      name: template.name,
    });

    const usageCounts = await this.getUsageCounts(tenantId, [templateId]);

    return this.toSummary(
      updated,
      usageCounts.get(templateId) ?? { jobCount: 0, taskCount: 0 },
    );
  }

  private toSummary(
    template: ChecklistTemplateWithItems,
    usage?: TemplateUsageStats,
  ): ChecklistTemplateSummary {
    const jobUsageCount = usage?.jobCount ?? 0;
    const taskUsageCount = usage?.taskCount ?? 0;

    return {
      id: template.id,
      name: template.name,
      description: template.description,
      isArchived: template.isArchived,
      jobUsageCount,
      taskUsageCount,
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

  private async getUsageCounts(
    tenantId: string,
    templateIds: string[],
  ): Promise<Map<string, TemplateUsageStats>> {
    const stats = new Map<string, TemplateUsageStats>();
    templateIds.forEach((id) =>
      stats.set(id, {
        jobCount: 0,
        taskCount: 0,
      }),
    );

    if (!templateIds.length) {
      return stats;
    }

    const taskCounts = await this.prisma.task.groupBy({
      by: ['checklistTemplateId'],
      where: {
        tenantId,
        checklistTemplateId: { in: templateIds },
      },
      _count: {
        _all: true,
      },
    });

    for (const group of taskCounts) {
      const entry = stats.get(group.checklistTemplateId);
      if (entry) {
        entry.taskCount = group._count._all;
      }
    }

    const jobGroups = await this.prisma.task.groupBy({
      by: ['checklistTemplateId', 'jobId'],
      where: {
        tenantId,
        checklistTemplateId: { in: templateIds },
      },
      _count: {
        _all: true,
      },
    });

    for (const group of jobGroups) {
      const entry = stats.get(group.checklistTemplateId);
      if (entry) {
        entry.jobCount += 1;
      }
    }

    return stats;
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

  async templateUsage(templateId: string): Promise<ChecklistTemplateUsage> {
    const tenantId = this.prisma.getTenantIdOrThrow();

    const template = await this.prisma.checklistTemplate.findFirst({
      where: { id: templateId, tenantId },
      select: { id: true, name: true },
    });

    if (!template) {
      throw new BadRequestException('Checklist template not found');
    }

    const tasks = await this.prisma.task.findMany({
      where: { tenantId, checklistTemplateId: templateId },
      select: {
        id: true,
        title: true,
        status: true,
        jobId: true,
        job: {
          select: {
            id: true,
            status: true,
            estimate: { select: { number: true } },
            lead: {
              select: {
                contact: {
                  select: { name: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const jobsMap = new Map<string, ChecklistTemplateUsageJob>();
    const SAMPLE_LIMIT = 3;

    for (const task of tasks) {
      if (!task.job) {
        continue;
      }

      const existing = jobsMap.get(task.job.id);
      const jobLabel =
        task.job.lead?.contact?.name ??
        task.job.estimate?.number ??
        `Job ${task.job.id.slice(0, 6).toUpperCase()}`;

      if (existing) {
        existing.taskCount += 1;
        if (existing.sampleTasks.length < SAMPLE_LIMIT) {
          existing.sampleTasks.push({
            id: task.id,
            title: task.title,
            status: task.status,
          });
        }
      } else {
        jobsMap.set(task.job.id, {
          jobId: task.job.id,
          jobStatus: task.job.status,
          jobLabel,
          taskCount: 1,
          sampleTasks: [
            {
              id: task.id,
              title: task.title,
              status: task.status,
            },
          ],
        });
      }
    }

    const jobs = Array.from(jobsMap.values()).sort((a, b) =>
      a.jobLabel.localeCompare(b.jobLabel),
    );

    return {
      template: {
        id: template.id,
        name: template.name,
      },
      totalJobs: jobs.length,
      totalTasks: tasks.length,
      jobs,
    };
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
