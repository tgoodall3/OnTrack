import { TimeEntry, TimeEntryStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { RequestContextService } from '../../context/request-context.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TimeEntriesService } from './time-entries.service';

const buildEntry = (overrides: Partial<TimeEntry> = {}): TimeEntry => ({
  id: 'entry_1',
  tenantId: 'tenant_1',
  jobId: 'job_1',
  userId: 'user_1',
  submittedById: null,
  approverId: null,
  clockIn: new Date(),
  clockOut: null,
  submittedAt: null,
  approvedAt: null,
  approvalNote: null,
  rejectionReason: null,
  status: TimeEntryStatus.IN_PROGRESS,
  durationMinutes: null,
  clockInLocation: null,
  clockOutLocation: null,
  notes: null,
  metadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
} as TimeEntry);

describe('TimeEntriesService', () => {
  let service: TimeEntriesService;
  let prisma: {
    getTenantIdOrThrow: jest.Mock;
    job: {
      findFirst: jest.Mock;
    };
    timeEntry: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let requestContext: Pick<
    RequestContextService,
    'context' | 'setTenantId' | 'setUser'
  >;

  beforeEach(async () => {
    prisma = {
      getTenantIdOrThrow: jest.fn().mockReturnValue('tenant_1'),
      job: {
        findFirst: jest.fn(),
      },
      timeEntry: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    requestContext = {
      context: {
        requestId: 'req-1',
        tenantId: 'tenant_1',
        userId: 'user_1',
      },
      setTenantId: jest.fn(),
      setUser: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        TimeEntriesService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: RequestContextService,
          useValue: requestContext,
        },
      ],
    }).compile();

    service = module.get(TimeEntriesService);
  });

  describe('listForJob', () => {
    it('returns mapped summaries', async () => {
      const clockIn = new Date('2025-10-29T09:00:00Z');
      const clockOut = new Date('2025-10-29T10:15:00Z');
      prisma.timeEntry.findMany.mockResolvedValue([
        buildEntry({
          id: 'entry_1',
          jobId: 'job_1',
          userId: 'user_1',
          clockIn,
          clockOut,
          status: TimeEntryStatus.SUBMITTED,
          clockInLocation: { lat: 10, lng: 20 },
          clockOutLocation: { lat: 11, lng: 21 },
          notes: 'Morning shift',
          submittedAt: clockOut,
          submittedById: 'user_1',
          durationMinutes: 75,
          createdAt: clockIn,
          updatedAt: clockOut,
        }),
      ]);

      const result = await service.listForJob('job_1', {});

      expect(prisma.timeEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant_1',
            jobId: 'job_1',
          }),
        }),
      );

      expect(result).toEqual([
        expect.objectContaining({
          id: 'entry_1',
          status: TimeEntryStatus.SUBMITTED,
          durationMinutes: 75,
          clockIn: clockIn.toISOString(),
          clockOut: clockOut.toISOString(),
          clockInLocation: expect.objectContaining({ lat: 10, lng: 20 }),
        }),
      ]);
    });
  });

  describe('clockIn', () => {
    it('requires user identity', async () => {
      requestContext.context.userId = undefined;

      await expect(
        service.clockIn('job_1', { clockIn: new Date().toISOString() }),
      ).rejects.toThrow('User identity is required for time entry.');
    });

    it('requires job to exist', async () => {
      prisma.job.findFirst.mockResolvedValue(null);

      await expect(
        service.clockIn('job_missing', { clockIn: new Date().toISOString() }),
      ).rejects.toThrow('Job not found');
    });

    it('prevents multiple active entries for a user', async () => {
      prisma.job.findFirst.mockResolvedValue({ id: 'job_1' });
      prisma.timeEntry.findFirst.mockResolvedValue(
        buildEntry({ id: 'entry_active' }),
      );

      await expect(
        service.clockIn('job_1', { clockIn: new Date().toISOString() }),
      ).rejects.toThrow('An active time entry already exists for this user.');
    });

    it('creates a new time entry', async () => {
      const clockIn = new Date('2025-10-29T08:00:00Z');
      prisma.job.findFirst.mockResolvedValue({ id: 'job_1' });
      prisma.timeEntry.findFirst.mockResolvedValue(null);
      prisma.timeEntry.create.mockResolvedValue(
        buildEntry({
          id: 'entry_new',
          jobId: 'job_1',
          userId: 'user_1',
          clockIn,
          createdAt: clockIn,
          updatedAt: clockIn,
        }),
      );

      const result = await service.clockIn('job_1', {
        clockIn: clockIn.toISOString(),
      });

      expect(prisma.timeEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant_1',
            jobId: 'job_1',
            userId: 'user_1',
            clockIn,
          }),
        }),
      );

      expect(result).toEqual(
        expect.objectContaining({
          id: 'entry_new',
          clockIn: clockIn.toISOString(),
          clockOut: null,
        }),
      );
    });
  });

  describe('clockOut', () => {
    it('throws when entry is not found', async () => {
      prisma.timeEntry.findFirst.mockResolvedValue(null);

      await expect(
        service.clockOut('job_1', 'entry_missing', {}),
      ).rejects.toThrow('Time entry not found');
    });

    it('prevents closing entries created by another user', async () => {
      prisma.timeEntry.findFirst.mockResolvedValue(
        buildEntry({
          id: 'entry_other',
          userId: 'other_user',
        }),
      );

      await expect(
        service.clockOut('job_1', 'entry_other', {}),
      ).rejects.toThrow('Cannot close a time entry created by another user.');
    });

    it('prevents closing completed entries', async () => {
      const clockIn = new Date('2025-10-29T08:00:00Z');
      const clockOut = new Date('2025-10-29T09:00:00Z');
      prisma.timeEntry.findFirst.mockResolvedValue(
        buildEntry({
          id: 'entry_complete',
          clockIn,
          clockOut,
          status: TimeEntryStatus.SUBMITTED,
          createdAt: clockIn,
          updatedAt: clockOut,
        }),
      );

      await expect(
        service.clockOut('job_1', 'entry_complete', {}),
      ).rejects.toThrow('This time entry is already completed.');
    });

    it('validates clock-out occurs after clock-in', async () => {
      const clockIn = new Date('2025-10-29T08:00:00Z');
      prisma.timeEntry.findFirst.mockResolvedValue(
        buildEntry({
          id: 'entry_active',
          clockIn,
          createdAt: clockIn,
          updatedAt: clockIn,
        }),
      );

      await expect(
        service.clockOut('job_1', 'entry_active', {
          clockOut: new Date('2025-10-29T07:00:00Z').toISOString(),
        }),
      ).rejects.toThrow('Clock-out time must be after the clock-in time.');
    });

    it('closes an active time entry', async () => {
      const clockIn = new Date('2025-10-29T08:00:00Z');
      prisma.timeEntry.findFirst.mockResolvedValue(
        buildEntry({
          id: 'entry_active',
          clockIn,
          clockInLocation: { lat: 1, lng: 2 },
          notes: 'Started job',
          createdAt: clockIn,
          updatedAt: clockIn,
        }),
      );

      const clockOut = new Date('2025-10-29T09:30:00Z');
      prisma.timeEntry.update.mockResolvedValue(
        buildEntry({
          id: 'entry_active',
          clockIn,
          clockOut,
          status: TimeEntryStatus.SUBMITTED,
          clockInLocation: { lat: 1, lng: 2 },
          clockOutLocation: { lat: 3, lng: 4 },
          notes: 'Completed job',
          submittedAt: clockOut,
          submittedById: 'user_1',
          durationMinutes: 90,
          createdAt: clockIn,
          updatedAt: clockOut,
        }),
      );

      const result = await service.clockOut('job_1', 'entry_active', {
        clockOut: clockOut.toISOString(),
        location: { lat: 3, lng: 4 },
        notes: 'Completed job',
      });

      expect(prisma.timeEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'entry_active' },
          data: expect.objectContaining({
            clockOut,
            clockOutLocation: { lat: 3, lng: 4 },
            status: TimeEntryStatus.SUBMITTED,
            submittedAt: clockOut,
            submittedById: 'user_1',
            durationMinutes: 90,
            notes: 'Completed job',
          }),
        }),
      );

      expect(result).toEqual(
        expect.objectContaining({
          id: 'entry_active',
          clockOut: clockOut.toISOString(),
          status: TimeEntryStatus.SUBMITTED,
          durationSeconds: 5400,
          durationMinutes: 90,
          notes: 'Completed job',
          clockOutLocation: expect.objectContaining({ lat: 3, lng: 4 }),
        }),
      );
    });
  });

  describe('approve', () => {
    it('throws when entry is missing', async () => {
      prisma.timeEntry.findFirst.mockResolvedValue(null);

      await expect(
        service.approve('job_1', 'entry_missing', { note: 'ok' }),
      ).rejects.toThrow('Time entry not found');
    });

    it('prevents approving entries still in progress', async () => {
      prisma.timeEntry.findFirst.mockResolvedValue(
        buildEntry({
          id: 'entry_in_progress',
          clockOut: null,
          status: TimeEntryStatus.IN_PROGRESS,
        }),
      );

      await expect(
        service.approve('job_1', 'entry_in_progress', { note: 'ok' }),
      ).rejects.toThrow(
        'Cannot approve a time entry that is still in progress.',
      );
    });

    it('approves a submitted time entry', async () => {
      requestContext.context.userId = 'supervisor_1';
      const clockOut = new Date('2025-10-29T09:30:00Z');
      prisma.timeEntry.findFirst.mockResolvedValue(
        buildEntry({
          id: 'entry_submitted',
          clockOut,
          status: TimeEntryStatus.SUBMITTED,
          submittedAt: clockOut,
          submittedById: 'user_1',
        }),
      );

      prisma.timeEntry.update.mockResolvedValue(
        buildEntry({
          id: 'entry_submitted',
          clockOut,
          status: TimeEntryStatus.APPROVED,
          submittedAt: clockOut,
          submittedById: 'user_1',
          approverId: 'supervisor_1',
          approvalNote: 'looks good',
          approvedAt: clockOut,
        }),
      );

      const result = await service.approve('job_1', 'entry_submitted', {
        note: 'looks good',
      });

      expect(prisma.timeEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'entry_submitted' },
          data: expect.objectContaining({
            status: TimeEntryStatus.APPROVED,
            approverId: 'supervisor_1',
            approvalNote: 'looks good',
          }),
        }),
      );

      expect(result).toEqual(
        expect.objectContaining({
          id: 'entry_submitted',
          status: TimeEntryStatus.APPROVED,
          approverId: 'supervisor_1',
          approvalNote: 'looks good',
        }),
      );
    });
  });

  describe('reject', () => {
    it('throws when entry is missing', async () => {
      prisma.timeEntry.findFirst.mockResolvedValue(null);

      await expect(
        service.reject('job_1', 'entry_missing', {
          reason: 'Need clarification',
        }),
      ).rejects.toThrow('Time entry not found');
    });

    it('prevents rejecting approved entries', async () => {
      prisma.timeEntry.findFirst.mockResolvedValue(
        buildEntry({
          id: 'entry_done',
          clockOut: new Date(),
          status: TimeEntryStatus.APPROVED,
        }),
      );

      await expect(
        service.reject('job_1', 'entry_done', {
          reason: 'Need clarification',
        }),
      ).rejects.toThrow('Approved time entries cannot be rejected.');
    });

    it('requests adjustment for submitted entries', async () => {
      requestContext.context.userId = 'supervisor_2';
      const clockOut = new Date('2025-10-29T10:00:00Z');
      prisma.timeEntry.findFirst.mockResolvedValue(
        buildEntry({
          id: 'entry_review',
          clockOut,
          status: TimeEntryStatus.SUBMITTED,
        }),
      );

      prisma.timeEntry.update.mockResolvedValue(
        buildEntry({
          id: 'entry_review',
          clockOut,
          status: TimeEntryStatus.ADJUSTMENT_REQUESTED,
          approverId: 'supervisor_2',
          rejectionReason: 'Missing travel time',
          approvalNote: 'Please adjust',
        }),
      );

      const result = await service.reject('job_1', 'entry_review', {
        reason: 'Missing travel time',
        note: 'Please adjust',
      });

      expect(prisma.timeEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'entry_review' },
          data: expect.objectContaining({
            status: TimeEntryStatus.ADJUSTMENT_REQUESTED,
            rejectionReason: 'Missing travel time',
            approvalNote: 'Please adjust',
            approverId: 'supervisor_2',
          }),
        }),
      );

      expect(result).toEqual(
        expect.objectContaining({
          id: 'entry_review',
          status: TimeEntryStatus.ADJUSTMENT_REQUESTED,
          rejectionReason: 'Missing travel time',
          approvalNote: 'Please adjust',
        }),
      );
    });
  });
});
