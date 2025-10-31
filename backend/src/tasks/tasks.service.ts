import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListTasksDto } from './dto/list-tasks.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { RequestContextService } from '../context/request-context.service';

type TaskWithRelations = Prisma.TaskGetPayload<{
  include: {
    assignee: {
      select: {
        id: true;
        name: true;
        email: true;
      };
    };
  };
}>;

export interface TaskSummary {
  id: string;
  title: string;
  status: TaskStatus;
  dueAt?: string | null;
  checklistTemplateId?: string | null;
  assignee?: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
  metadata?: Prisma.JsonValue;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

  async list(jobId: string, params: ListTasksDto): Promise<TaskSummary[]> {
    const tenantId = this.prisma.getTenantIdOrThrow();
    await this.ensureJobAccess(jobId, tenantId);

    const where: Prisma.TaskWhereInput = {
      jobId,
      tenantId,
    };

    if (params.status) {
      where.status = params.status;
    }

    if (params.assigneeId) {
      where.assigneeId = params.assigneeId;
    }

    const tasks = await this.prisma.task.findMany({
      where,
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'asc' }],
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return tasks.map((task) => this.toSummary(task));
  }

  async create(jobId: string, dto: CreateTaskDto): Promise<TaskSummary> {
    const tenantId = this.prisma.getTenantIdOrThrow();
    await this.ensureJobAccess(jobId, tenantId);

    const task = await this.prisma.task.create({
      data: {
        tenant: { connect: { id: tenantId } },
        job: { connect: { id: jobId } },
        title: dto.title,
        status: dto.status ?? TaskStatus.PENDING,
        assignee: dto.assigneeId
          ? { connect: { id: dto.assigneeId } }
          : undefined,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        checklistTemplate: dto.checklistTemplateId
          ? { connect: { id: dto.checklistTemplateId } }
          : undefined,
      },
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return this.toSummary(task);
  }

  async update(
    jobId: string,
    taskId: string,
    dto: UpdateTaskDto,
  ): Promise<TaskSummary> {
    const tenantId = this.prisma.getTenantIdOrThrow();
    await this.ensureJobAccess(jobId, tenantId);

    const existing = await this.prisma.task.findFirst({
      where: { id: taskId, jobId, tenantId },
      select: {
        id: true,
        title: true,
        checklistTemplateId: true,
      },
    });

    if (!existing) {
      throw new BadRequestException('Task not found');
    }

    const data: Prisma.TaskUpdateInput = {};

    if (dto.title !== undefined) data.title = dto.title;
    if (dto.status) data.status = dto.status;

    if (dto.assigneeId !== undefined) {
      data.assignee = dto.assigneeId
        ? { connect: { id: dto.assigneeId } }
        : { disconnect: true };
    }

    if (dto.dueAt !== undefined) {
      data.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    }

    if (dto.checklistTemplateId !== undefined) {
      data.checklistTemplate = dto.checklistTemplateId
        ? { connect: { id: dto.checklistTemplateId } }
        : { disconnect: true };
    }

    if (dto.metadata !== undefined) {
      data.metadata = dto.metadata as Prisma.JsonValue;
    }

    const task = await this.prisma.task.update({
      where: {
        id: taskId,
        jobId,
        tenantId,
      },
      data,
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const templateDetached =
      !!existing.checklistTemplateId && !task.checklistTemplateId;
    const titleChanged = existing.title !== task.title;

    if (templateDetached) {
      await this.logJobActivity(
        tenantId,
        jobId,
        'job.checklist_task_detached',
        {
          taskId,
          previousTemplateId: existing.checklistTemplateId,
          title: task.title,
        },
      );
    }

    if (titleChanged) {
      await this.logJobActivity(tenantId, jobId, 'job.task_renamed', {
        taskId,
        previousTitle: existing.title,
        title: task.title,
      });
    }

    return this.toSummary(task);
  }

  async remove(jobId: string, taskId: string): Promise<void> {
    const tenantId = this.prisma.getTenantIdOrThrow();
    await this.ensureJobAccess(jobId, tenantId);

    await this.prisma.task.delete({
      where: {
        id: taskId,
        jobId,
        tenantId,
      },
    });
  }

  private async ensureJobAccess(
    jobId: string,
    tenantId: string,
  ): Promise<void> {
    const job = await this.prisma.job.findFirst({
      where: {
        id: jobId,
        tenantId,
      },
      select: { id: true },
    });

    if (!job) {
      throw new BadRequestException('Job not found');
    }
  }

  private toSummary(task: TaskWithRelations): TaskSummary {
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      dueAt: task.dueAt?.toISOString() ?? null,
      checklistTemplateId: task.checklistTemplateId ?? undefined,
      assignee: task.assignee
        ? {
            id: task.assignee.id,
            name: task.assignee.name,
            email: task.assignee.email,
          }
        : undefined,
      metadata: task.metadata ?? undefined,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }

  private async logJobActivity(
    tenantId: string,
    jobId: string,
    action: string,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    const actorId = this.requestContext.context?.userId ?? null;
    await this.prisma.activityLog.create({
      data: {
        tenantId,
        entityType: 'job',
        entityId: jobId,
        action,
        meta: meta ? (meta as Prisma.JsonValue) : undefined,
        actorId,
      },
    });
  }
}
