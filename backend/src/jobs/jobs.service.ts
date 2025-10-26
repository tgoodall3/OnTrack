import { BadRequestException, Injectable } from '@nestjs/common';
import { JobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContextService } from '../context/request-context.service';
import { ListJobsDto } from './dto/list-jobs.dto';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';

type JobWithRelations = Prisma.JobGetPayload<{
  include: {
    lead: {
      select: {
        id: true;
        stage: true;
        contact: { select: { name: true } };
      };
    };
    estimate: {
      select: {
        id: true;
        number: true;
        status: true;
      };
    };
    property: {
      select: {
        id: true;
        address: true;
      };
    };
  };
}>;

export interface JobSummary {
  id: string;
  status: JobStatus;
  notes?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  createdAt: string;
  updatedAt: string;
  lead?: {
    id: string;
    stage: string;
    contactName?: string | null;
  };
  estimate?: {
    id: string;
    number?: string | null;
    status: string;
  };
  property?: {
    id: string;
    address: string;
  };
}

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

  async list(params: ListJobsDto): Promise<JobSummary[]> {
    const where: Prisma.JobWhereInput = {};
    const take = params.take ?? 25;

    if (params.status) {
      where.status = params.status;
    }

    if (params.leadId) {
      where.leadId = params.leadId;
    }

    if (params.scheduledAfter || params.scheduledBefore) {
      where.scheduledStart = {};
      if (params.scheduledAfter) {
        where.scheduledStart.gte = new Date(params.scheduledAfter);
      }
      if (params.scheduledBefore) {
        where.scheduledStart.lte = new Date(params.scheduledBefore);
      }
    }

    const jobs = await this.prisma.job.findMany({
      where,
      orderBy: [{ scheduledStart: 'asc' }, { createdAt: 'desc' }],
      take,
      include: {
        lead: {
          select: {
            id: true,
            stage: true,
            contact: { select: { name: true } },
          },
        },
        estimate: {
          select: {
            id: true,
            number: true,
            status: true,
          },
        },
        property: {
          select: {
            id: true,
            address: true,
          },
        },
      },
    });

    return jobs.map((job) => this.toSummary(job));
  }

  async findOne(id: string): Promise<JobSummary> {
    const job = await this.prisma.job.findFirst({
      where: { id },
      include: {
        lead: {
          select: {
            id: true,
            stage: true,
            contact: { select: { name: true } },
          },
        },
        estimate: {
          select: {
            id: true,
            number: true,
            status: true,
          },
        },
        property: {
          select: {
            id: true,
            address: true,
          },
        },
      },
    });

    if (!job) {
      throw new BadRequestException('Job not found');
    }

    return this.toSummary(job);
  }

  async create(dto: CreateJobDto): Promise<JobSummary> {
    if (!dto.leadId && !dto.estimateId) {
      throw new BadRequestException('Lead or estimate is required');
    }

    const tenantId = this.prisma.getTenantIdOrThrow();

    let leadId = dto.leadId;
    let propertyId = dto.propertyId;

    if (dto.estimateId) {
      const estimate = await this.prisma.estimate.findFirst({
        where: { id: dto.estimateId },
        include: {
          lead: {
            select: {
              id: true,
              propertyId: true,
            },
          },
        },
      });

      if (!estimate) {
        throw new BadRequestException('Estimate not found');
      }

      leadId = estimate.leadId;
      if (!propertyId && estimate.lead?.propertyId) {
        propertyId = estimate.lead.propertyId;
      }
    }

    if (!leadId) {
      throw new BadRequestException('Lead could not be determined for job');
    }

    const job = await this.prisma.job.create({
      data: {
        tenant: { connect: { id: tenantId } },
        lead: { connect: { id: leadId } },
        estimate: dto.estimateId
          ? { connect: { id: dto.estimateId } }
          : undefined,
        property: propertyId ? { connect: { id: propertyId } } : undefined,
        status: dto.status ?? JobStatus.DRAFT,
        scheduledStart: dto.scheduledStart
          ? new Date(dto.scheduledStart)
          : undefined,
        scheduledEnd: dto.scheduledEnd ? new Date(dto.scheduledEnd) : undefined,
        notes: dto.notes,
      },
      include: {
        lead: {
          select: {
            id: true,
            stage: true,
            contact: { select: { name: true } },
          },
        },
        estimate: {
          select: {
            id: true,
            number: true,
            status: true,
          },
        },
        property: {
          select: {
            id: true,
            address: true,
          },
        },
      },
    });

    await this.logLeadActivity(tenantId, leadId, 'lead.job_created', {
      jobId: job.id,
      status: job.status,
      estimateId: dto.estimateId ?? undefined,
    });

    return this.toSummary(job);
  }

  async update(id: string, dto: UpdateJobDto): Promise<JobSummary> {
    const data: Prisma.JobUpdateInput = {};

    if (dto.status) data.status = dto.status;
    if (dto.scheduledStart !== undefined) {
      data.scheduledStart = dto.scheduledStart
        ? new Date(dto.scheduledStart)
        : null;
    }
    if (dto.scheduledEnd !== undefined) {
      data.scheduledEnd = dto.scheduledEnd ? new Date(dto.scheduledEnd) : null;
    }
    if (dto.actualStart !== undefined) {
      data.actualStart = dto.actualStart ? new Date(dto.actualStart) : null;
    }
    if (dto.actualEnd !== undefined) {
      data.actualEnd = dto.actualEnd ? new Date(dto.actualEnd) : null;
    }
    if (dto.notes !== undefined) data.notes = dto.notes;

    const job = await this.prisma.job.update({
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
        estimate: {
          select: {
            id: true,
            number: true,
            status: true,
          },
        },
        property: {
          select: {
            id: true,
            address: true,
          },
        },
      },
    });

    return this.toSummary(job);
  }

  async remove(id: string): Promise<void> {
    await this.prisma.job.delete({
      where: { id },
    });
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

  private toSummary(job: JobWithRelations): JobSummary {
    return {
      id: job.id,
      status: job.status,
      notes: job.notes,
      scheduledStart: job.scheduledStart?.toISOString() ?? null,
      scheduledEnd: job.scheduledEnd?.toISOString() ?? null,
      actualStart: job.actualStart?.toISOString() ?? null,
      actualEnd: job.actualEnd?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      lead: job.lead
        ? {
            id: job.lead.id,
            stage: job.lead.stage,
            contactName: job.lead.contact?.name,
          }
        : undefined,
      estimate: job.estimate
        ? {
            id: job.estimate.id,
            number: job.estimate.number,
            status: job.estimate.status,
          }
        : undefined,
      property: job.property
        ? {
            id: job.property.id,
            address: formatAddress(job.property.address),
          }
        : undefined,
    };
  }
}

function formatAddress(address: Prisma.JsonValue | null): string {
  if (!address || typeof address !== 'object' || Array.isArray(address)) {
    return 'Address to be confirmed';
  }

  const record = address as Record<string, unknown>;
  const line1 = toString(record.line1);
  const line2 = toString(record.line2);
  const city = toString(record.city);
  const state = toString(record.state);
  const postalCode = toString(record.postalCode);

  const parts: string[] = [];
  if (line1) parts.push(line1);
  if (line2) parts.push(line2);
  const cityState = [city, state].filter(Boolean).join(', ');
  if (cityState) parts.push(cityState);
  if (postalCode) parts.push(postalCode);

  return parts.length ? parts.join(' ') : 'Address to be confirmed';
}

function toString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }
  return undefined;
}
