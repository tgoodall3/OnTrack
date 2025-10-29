import { BadRequestException, Injectable } from '@nestjs/common';
import { JobStatus, Prisma, TimeEntry } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestContextService } from '../../context/request-context.service';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
import { ListTimeEntriesDto } from './dto/list-time-entries.dto';

export interface TimeEntrySummary {
  id: string;
  jobId: string;
  userId: string;
  clockIn: string;
  clockOut: string | null;
  durationSeconds: number | null;
  gps?: Prisma.JsonValue | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class TimeEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

  async listForJob(
    jobId: string,
    params: ListTimeEntriesDto,
  ): Promise<TimeEntrySummary[]> {
    const tenantId = this.prisma.getTenantIdOrThrow();
    const targetUserId = params.userId;

    const entries = await this.prisma.timeEntry.findMany({
      where: {
        tenantId,
        jobId,
        userId: targetUserId ?? undefined,
      },
      orderBy: { clockIn: 'desc' },
    });

    return entries.map((entry) => this.toSummary(entry));
  }

  async clockIn(jobId: string, dto: ClockInDto): Promise<TimeEntrySummary> {
    const tenantId = this.prisma.getTenantIdOrThrow();
    const userId = this.resolveUserId(dto.userId);

    await this.ensureJobExists(jobId, tenantId);
    await this.assertNoActiveEntry(tenantId, userId);

    const clockInDate = dto.clockIn ? new Date(dto.clockIn) : new Date();

    const entry = await this.prisma.timeEntry.create({
      data: {
        tenantId,
        jobId,
        userId,
        clockIn: clockInDate,
        gps: dto.gps ? (dto.gps as Prisma.InputJsonValue) : undefined,
        notes: dto.notes ?? undefined,
      },
    });

    return this.toSummary(entry);
  }

  async clockOut(
    jobId: string,
    entryId: string,
    dto: ClockOutDto,
  ): Promise<TimeEntrySummary> {
    const tenantId = this.prisma.getTenantIdOrThrow();
    const userId = this.resolveUserId(dto.userId);

    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        tenantId,
        jobId,
        id: entryId,
      },
    });

    if (!entry) {
      throw new BadRequestException('Time entry not found');
    }

    if (entry.userId !== userId) {
      throw new BadRequestException(
        'Cannot close a time entry created by another user.',
      );
    }

    if (entry.clockOut) {
      throw new BadRequestException('This time entry is already completed.');
    }

    const clockOutDate = dto.clockOut ? new Date(dto.clockOut) : new Date();
    if (clockOutDate <= entry.clockIn) {
      throw new BadRequestException(
        'Clock-out time must be after the clock-in time.',
      );
    }

    const updated = await this.prisma.timeEntry.update({
      where: { id: entryId },
      data: {
        clockOut: clockOutDate,
        gps: dto.gps
          ? (dto.gps as Prisma.InputJsonValue)
          : entry.gps ?? undefined,
        notes: dto.notes ?? entry.notes ?? undefined,
      },
    });

    return this.toSummary(updated);
  }

  private resolveUserId(explicitUserId?: string): string {
    const resolved =
      explicitUserId ?? this.requestContext.context.userId ?? undefined;
    if (!resolved) {
      throw new BadRequestException('User identity is required for time entry.');
    }
    return resolved;
  }

  private async ensureJobExists(jobId: string, tenantId: string): Promise<void> {
    const job = await this.prisma.job.findFirst({
      where: {
        id: jobId,
        tenantId,
        status: {
          not: JobStatus.CANCELED,
        },
      },
      select: { id: true },
    });

    if (!job) {
      throw new BadRequestException('Job not found');
    }
  }

  private async assertNoActiveEntry(
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const existing = await this.prisma.timeEntry.findFirst({
      where: {
        tenantId,
        userId,
        clockOut: null,
      },
    });

    if (existing) {
      throw new BadRequestException(
        'An active time entry already exists for this user.',
      );
    }
  }

  private toSummary(entry: TimeEntry): TimeEntrySummary {
    const clockOut = entry.clockOut ? new Date(entry.clockOut) : null;
    const clockIn = new Date(entry.clockIn);
    const durationSeconds = clockOut
      ? Math.floor((clockOut.getTime() - clockIn.getTime()) / 1000)
      : null;

    return {
      id: entry.id,
      jobId: entry.jobId,
      userId: entry.userId,
      clockIn: clockIn.toISOString(),
      clockOut: clockOut?.toISOString() ?? null,
      durationSeconds,
      gps: entry.gps ?? null,
      notes: entry.notes ?? null,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    };
  }
}
