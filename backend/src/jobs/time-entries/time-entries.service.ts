import { BadRequestException, Injectable } from '@nestjs/common';
import { JobStatus, Prisma, TimeEntry, TimeEntryStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestContextService } from '../../context/request-context.service';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
import { ApproveTimeEntryDto, RejectTimeEntryDto } from './dto/review-time-entry.dto';
import { ListTimeEntriesDto } from './dto/list-time-entries.dto';

export interface TimeEntryLocationSummary {
  lat: number;
  lng: number;
  accuracy?: number | null;
  capturedAt?: string | null;
}

export interface TimeEntrySummary {
  id: string;
  jobId: string;
  userId: string;
  status: TimeEntryStatus;
  clockIn: string;
  clockOut: string | null;
  durationSeconds: number | null;
  durationMinutes: number | null;
  clockInLocation: TimeEntryLocationSummary | null;
  clockOutLocation: TimeEntryLocationSummary | null;
  notes: string | null;
  approvalNote: string | null;
  rejectionReason: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  submittedById: string | null;
  approverId: string | null;
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
        status: TimeEntryStatus.IN_PROGRESS,
        clockInLocation: dto.location
          ? (dto.location as unknown as Prisma.InputJsonValue)
          : undefined,
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

    if (entry.status !== TimeEntryStatus.IN_PROGRESS) {
      throw new BadRequestException(
        'Only in-progress time entries can be clocked out.',
      );
    }

    const clockOutDate = dto.clockOut ? new Date(dto.clockOut) : new Date();
    if (clockOutDate <= entry.clockIn) {
      throw new BadRequestException(
        'Clock-out time must be after the clock-in time.',
      );
    }

    const durationMinutes = Math.floor(
      (clockOutDate.getTime() - entry.clockIn.getTime()) / 60000,
    );

    const updated = await this.prisma.timeEntry.update({
      where: { id: entryId },
      data: {
        clockOut: clockOutDate,
        clockOutLocation: dto.location
          ? (dto.location as unknown as Prisma.InputJsonValue)
          : entry.clockOutLocation ?? undefined,
        durationMinutes,
        status: TimeEntryStatus.SUBMITTED,
        submittedAt: clockOutDate,
        submittedById: userId,
        rejectionReason: null,
        notes: dto.notes ?? entry.notes ?? undefined,
      },
    });

    return this.toSummary(updated);
  }

  async approve(
    jobId: string,
    entryId: string,
    dto: ApproveTimeEntryDto,
  ): Promise<TimeEntrySummary> {
    const tenantId = this.prisma.getTenantIdOrThrow();
    const approverId = this.resolveUserId(dto.approverId);

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

    if (!entry.clockOut) {
      throw new BadRequestException(
        'Cannot approve a time entry that is still in progress.',
      );
    }

    if (
      entry.status !== TimeEntryStatus.SUBMITTED &&
      entry.status !== TimeEntryStatus.ADJUSTMENT_REQUESTED
    ) {
      throw new BadRequestException(
        'Only submitted time entries can be approved.',
      );
    }

    const now = new Date();
    const updated = await this.prisma.timeEntry.update({
      where: { id: entryId },
      data: {
        status: TimeEntryStatus.APPROVED,
        approverId,
        approvalNote: dto.note ?? null,
        rejectionReason: null,
        approvedAt: now,
      },
    });

    return this.toSummary(updated);
  }

  async reject(
    jobId: string,
    entryId: string,
    dto: RejectTimeEntryDto,
  ): Promise<TimeEntrySummary> {
    const tenantId = this.prisma.getTenantIdOrThrow();
    const approverId = this.resolveUserId(dto.approverId);

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

    if (!entry.clockOut) {
      throw new BadRequestException(
        'Cannot reject a time entry that is still in progress.',
      );
    }

    if (entry.status === TimeEntryStatus.APPROVED) {
      throw new BadRequestException('Approved time entries cannot be rejected.');
    }

    const updated = await this.prisma.timeEntry.update({
      where: { id: entryId },
      data: {
        status: TimeEntryStatus.ADJUSTMENT_REQUESTED,
        approverId,
        approvalNote: dto.note ?? null,
        rejectionReason: dto.reason,
        approvedAt: null,
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
        status: TimeEntryStatus.IN_PROGRESS,
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
    const durationMinutes =
      entry.durationMinutes ??
      (durationSeconds !== null ? Math.floor(durationSeconds / 60) : null);

    return {
      id: entry.id,
      jobId: entry.jobId,
      userId: entry.userId,
      status: entry.status,
      clockIn: clockIn.toISOString(),
      clockOut: clockOut?.toISOString() ?? null,
      durationSeconds,
      durationMinutes,
      clockInLocation: this.normalizeLocation(entry.clockInLocation ?? null),
      clockOutLocation: this.normalizeLocation(entry.clockOutLocation ?? null),
      notes: entry.notes ?? null,
      approvalNote: entry.approvalNote ?? null,
      rejectionReason: entry.rejectionReason ?? null,
      submittedAt: entry.submittedAt
        ? new Date(entry.submittedAt).toISOString()
        : null,
      approvedAt: entry.approvedAt
        ? new Date(entry.approvedAt).toISOString()
        : null,
      submittedById: entry.submittedById ?? null,
      approverId: entry.approverId ?? null,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    };
  }

  private normalizeLocation(
    value: Prisma.JsonValue | null,
  ): TimeEntryLocationSummary | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;
    const lat = typeof record.lat === 'number' ? record.lat : null;
    const lng = typeof record.lng === 'number' ? record.lng : null;

    if (lat === null || lng === null) {
      return null;
    }

    const accuracy =
      typeof record.accuracy === 'number' ? record.accuracy : null;
    const capturedAt =
      typeof record.capturedAt === 'string' ? record.capturedAt : null;

    return {
      lat,
      lng,
      accuracy,
      capturedAt,
    };
  }
}
