import { Injectable } from '@nestjs/common';
import {
  EstimateStatus,
  JobStatus,
  LeadStage,
  Prisma,
  RoleKey,
  TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface DashboardMetrics {
  jobs: {
    active: number;
    upcomingVisits: number;
    crewUtilization: number;
  };
  pipeline: {
    newLeads: number;
    estimatesSent: number;
    approved: number;
    jobsScheduled: number;
    tasksCompleted: number;
    tasksPending: number;
    pipelineValue: number;
  };
  nextVisits: Array<{
    id: string;
    title: string;
    address: string;
    scheduledAt: Date;
    crewName: string;
    status: string;
  }>;
}

type UpcomingJobLead = {
  contact: { name: string | null } | null;
  source: string | null;
} | null;

type UpcomingJobRecord = {
  id: string;
  scheduledStart: Date | null;
  status: JobStatus;
  property: { address: Prisma.JsonValue } | null;
  lead: UpcomingJobLead;
  estimate: { number: string | null } | null;
  tasks: Array<{ assignee: { name: string | null } | null }>;
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardMetrics(): Promise<DashboardMetrics> {
    const tenantId = this.prisma.getTenantIdOrThrow();
    const now = new Date();
    const lookbackStart = this.subtractDays(now, 7);
    const scheduleHorizon = this.addHours(now, 48);
    const weekStart = this.startOfWeek(now);

    const [
      activeJobs,
      upcomingVisits,
      crewMembers,
      timeEntries,
      newLeads,
      estimatesSent,
      estimatesApproved,
      pipelineTotals,
      jobsScheduled,
      tasksCompletedCount,
      tasksPendingCount,
      upcomingJobs,
    ] = await Promise.all([
      this.prisma.job.count({
        where: {
          tenantId,
          status: { in: [JobStatus.SCHEDULED, JobStatus.IN_PROGRESS] },
        },
      }),
      this.prisma.job.count({
        where: {
          tenantId,
          status: { in: [JobStatus.SCHEDULED, JobStatus.IN_PROGRESS] },
          scheduledStart: {
            gte: now,
            lte: scheduleHorizon,
          },
        },
      }),
      this.prisma.user.count({
        where: {
          tenantId,
          roleAssignments: {
            some: {
              role: {
                key: RoleKey.CREW,
              },
            },
          },
        },
      }),
      this.prisma.timeEntry.findMany({
        where: {
          tenantId,
          clockIn: {
            gte: weekStart,
          },
        },
        select: {
          clockIn: true,
          clockOut: true,
        },
      }),
      this.prisma.lead.count({
        where: {
          tenantId,
          stage: LeadStage.NEW,
          createdAt: {
            gte: lookbackStart,
          },
        },
      }),
      this.prisma.estimate.count({
        where: {
          tenantId,
          status: EstimateStatus.SENT,
          createdAt: {
            gte: lookbackStart,
          },
        },
      }),
      this.prisma.estimate.count({
        where: {
          tenantId,
          status: EstimateStatus.APPROVED,
          updatedAt: {
            gte: lookbackStart,
          },
        },
      }),
      this.prisma.estimate.aggregate({
        where: {
          tenantId,
          status: {
            in: [EstimateStatus.SENT, EstimateStatus.APPROVED],
          },
        },
        _sum: {
          total: true,
        },
      }),
      this.prisma.job.count({
        where: {
          tenantId,
          status: {
            in: [
              JobStatus.SCHEDULED,
              JobStatus.IN_PROGRESS,
              JobStatus.COMPLETED,
            ],
          },
          createdAt: {
            gte: lookbackStart,
          },
        },
      }),
      this.prisma.task.count({
        where: {
          tenantId,
          status: TaskStatus.COMPLETE,
        },
      }),
      this.prisma.task.count({
        where: {
          tenantId,
          status: { not: TaskStatus.COMPLETE },
        },
      }),
      this.prisma.job.findMany({
        where: {
          tenantId,
          status: {
            in: [JobStatus.SCHEDULED, JobStatus.IN_PROGRESS],
          },
          scheduledStart: {
            not: null,
            gte: now,
          },
        },
        orderBy: {
          scheduledStart: 'asc',
        },
        take: 6,
        select: {
          id: true,
          scheduledStart: true,
          status: true,
          property: {
            select: {
              address: true,
            },
          },
          lead: {
            select: {
              contact: {
                select: {
                  name: true,
                },
              },
              source: true,
            },
          },
          estimate: {
            select: {
              number: true,
            },
          },
          tasks: {
            where: {
              assigneeId: {
                not: null,
              },
            },
            select: {
              assignee: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const crewUtilization = this.calculateCrewUtilization(
      crewMembers,
      timeEntries,
      now,
    );
    const pipelineValue = this.extractNumeric(pipelineTotals._sum.total);

    return {
      jobs: {
        active: activeJobs,
        upcomingVisits,
        crewUtilization,
      },
      pipeline: {
        newLeads,
        estimatesSent,
        approved: estimatesApproved,
        jobsScheduled,
        tasksCompleted: tasksCompletedCount,
        tasksPending: tasksPendingCount,
        pipelineValue,
      },
      nextVisits: upcomingJobs.map((job) => this.toUpcomingVisit(job, now)),
    };
  }

  private calculateCrewUtilization(
    crewMembers: number,
    timeEntries: Array<{ clockIn: Date; clockOut: Date | null }>,
    referenceDate: Date,
  ): number {
    if (!crewMembers) {
      return 0;
    }

    const totalMilliseconds = timeEntries.reduce((accumulator, entry) => {
      const end = entry.clockOut ?? referenceDate;
      const duration = end.getTime() - entry.clockIn.getTime();
      return duration > 0 ? accumulator + duration : accumulator;
    }, 0);
    const totalMinutes = totalMilliseconds / (1000 * 60);

    const capacityMinutes = crewMembers * 40 * 60; // assume 40h weekly schedule
    if (capacityMinutes <= 0) {
      return 0;
    }

    const utilization = Math.round((totalMinutes / capacityMinutes) * 100);
    return Math.max(0, Math.min(100, utilization));
  }

  private toUpcomingVisit(
    job: UpcomingJobRecord,
    fallbackDate: Date,
  ): DashboardMetrics['nextVisits'][number] {
    const scheduledAt = job.scheduledStart ?? fallbackDate;
    const crewNames = job.tasks
      .map((task) => task.assignee?.name?.trim())
      .filter((name): name is string => Boolean(name));
    const uniqueCrew = Array.from(new Set(crewNames));

    return {
      id: job.id,
      title: this.deriveJobTitle(job),
      address: this.formatAddress(job.property?.address),
      scheduledAt,
      crewName: this.formatCrewLabel(uniqueCrew),
      status: this.humanizeJobStatus(job.status),
    };
  }

  private deriveJobTitle(
    job: Pick<UpcomingJobRecord, 'id' | 'lead' | 'estimate'>,
  ): string {
    const contactName = job.lead?.contact?.name?.trim();
    if (contactName) {
      return `${contactName} project`;
    }

    const estimateNumber = job.estimate?.number?.trim();
    if (estimateNumber) {
      return `Estimate ${estimateNumber}`;
    }

    const source = job.lead?.source?.trim();
    if (source) {
      return `${source} job`;
    }

    return `Job ${job.id.slice(0, 8)}`;
  }

  private formatAddress(address: Prisma.JsonValue | null | undefined): string {
    if (!address || typeof address !== 'object' || Array.isArray(address)) {
      return 'Address to be confirmed';
    }

    const record = address as Record<string, unknown>;
    const line1 = this.toString(record.line1);
    const line2 = this.toString(record.line2);
    const city = this.toString(record.city);
    const state = this.toString(record.state);
    const postalCode = this.toString(record.postalCode);

    const parts: string[] = [];
    if (line1) parts.push(line1);
    if (line2) parts.push(line2);

    const cityState = [city, state].filter(Boolean).join(', ');
    if (cityState) {
      parts.push(cityState);
    }

    if (postalCode) {
      parts.push(postalCode);
    }

    return parts.length ? parts.join(' ') : 'Address to be confirmed';
  }

  private formatCrewLabel(names: string[]): string {
    if (!names.length) {
      return 'Crew to be assigned';
    }

    if (names.length === 1) {
      return names[0];
    }

    return `${names[0]} + ${names.length - 1} more`;
  }

  private humanizeJobStatus(status: JobStatus): string {
    switch (status) {
      case JobStatus.SCHEDULED:
        return 'Scheduled';
      case JobStatus.IN_PROGRESS:
        return 'In progress';
      case JobStatus.COMPLETED:
        return 'Completed';
      case JobStatus.ON_HOLD:
        return 'On hold';
      case JobStatus.CANCELED:
        return 'Canceled';
      default:
        return 'Draft';
    }
  }

  private extractNumeric(value: Prisma.Decimal | null | undefined): number {
    if (!value) {
      return 0;
    }

    if (
      typeof value === 'object' &&
      'toNumber' in value &&
      typeof value.toNumber === 'function'
    ) {
      return value.toNumber();
    }

    return Number(value);
  }

  private startOfWeek(date: Date): Date {
    const result = new Date(date);
    const day = result.getDay() || 7; // ISO week starts on Monday
    if (day !== 1) {
      result.setDate(result.getDate() - (day - 1));
    }
    result.setHours(0, 0, 0, 0);
    return result;
  }

  private subtractDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() - days);
    return result;
  }

  private addHours(date: Date, hours: number): Date {
    const result = new Date(date);
    result.setHours(result.getHours() + hours);
    return result;
  }

  private toString(value: unknown): string | undefined {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    }
    return undefined;
  }
}
