import { Test } from '@nestjs/testing';
import { TimeEntriesService } from './time-entries.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestContextService } from '../../context/request-context.service';

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
        {
          id: 'entry_1',
          tenantId: 'tenant_1',
          jobId: 'job_1',
          userId: 'user_1',
          clockIn,
          clockOut,
          gps: { lat: 10, lng: 20 },
          notes: 'Morning shift',
          createdAt: clockIn,
          updatedAt: clockOut,
        },
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
          durationSeconds: 75 * 60,
          clockIn: clockIn.toISOString(),
          clockOut: clockOut.toISOString(),
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
      prisma.timeEntry.findFirst.mockResolvedValue({
        id: 'entry_active',
      });

      await expect(
        service.clockIn('job_1', { clockIn: new Date().toISOString() }),
      ).rejects.toThrow('An active time entry already exists for this user.');
    });

    it('creates a new time entry', async () => {
      const clockIn = new Date('2025-10-29T08:00:00Z');
      prisma.job.findFirst.mockResolvedValue({ id: 'job_1' });
      prisma.timeEntry.findFirst.mockResolvedValue(null);
      prisma.timeEntry.create.mockResolvedValue({
        id: 'entry_new',
        tenantId: 'tenant_1',
        jobId: 'job_1',
        userId: 'user_1',
        clockIn,
        clockOut: null,
        gps: null,
        notes: null,
        createdAt: clockIn,
        updatedAt: clockIn,
      });

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
      prisma.timeEntry.findFirst.mockResolvedValue({
        id: 'entry_other',
        tenantId: 'tenant_1',
        jobId: 'job_1',
        userId: 'other_user',
        clockIn: new Date(),
        clockOut: null,
        gps: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        service.clockOut('job_1', 'entry_other', {}),
      ).rejects.toThrow('Cannot close a time entry created by another user.');
    });

    it('prevents closing completed entries', async () => {
      const clockIn = new Date('2025-10-29T08:00:00Z');
      const clockOut = new Date('2025-10-29T09:00:00Z');
      prisma.timeEntry.findFirst.mockResolvedValue({
        id: 'entry_complete',
        tenantId: 'tenant_1',
        jobId: 'job_1',
        userId: 'user_1',
        clockIn,
        clockOut,
        gps: null,
        notes: null,
        createdAt: clockIn,
        updatedAt: clockOut,
      });

      await expect(
        service.clockOut('job_1', 'entry_complete', {}),
      ).rejects.toThrow('This time entry is already completed.');
    });

    it('validates clock-out occurs after clock-in', async () => {
      const clockIn = new Date('2025-10-29T08:00:00Z');
      prisma.timeEntry.findFirst.mockResolvedValue({
        id: 'entry_active',
        tenantId: 'tenant_1',
        jobId: 'job_1',
        userId: 'user_1',
        clockIn,
        clockOut: null,
        gps: null,
        notes: null,
        createdAt: clockIn,
        updatedAt: clockIn,
      });

      await expect(
        service.clockOut('job_1', 'entry_active', {
          clockOut: new Date('2025-10-29T07:00:00Z').toISOString(),
        }),
      ).rejects.toThrow('Clock-out time must be after the clock-in time.');
    });

    it('closes an active time entry', async () => {
      const clockIn = new Date('2025-10-29T08:00:00Z');
      prisma.timeEntry.findFirst.mockResolvedValue({
        id: 'entry_active',
        tenantId: 'tenant_1',
        jobId: 'job_1',
        userId: 'user_1',
        clockIn,
        clockOut: null,
        gps: { lat: 1, lng: 2 },
        notes: 'Started job',
        createdAt: clockIn,
        updatedAt: clockIn,
      });

      const clockOut = new Date('2025-10-29T09:30:00Z');
      prisma.timeEntry.update.mockResolvedValue({
        id: 'entry_active',
        tenantId: 'tenant_1',
        jobId: 'job_1',
        userId: 'user_1',
        clockIn,
        clockOut,
        gps: { lat: 3, lng: 4 },
        notes: 'Completed job',
        createdAt: clockIn,
        updatedAt: clockOut,
      });

      const result = await service.clockOut('job_1', 'entry_active', {
        clockOut: clockOut.toISOString(),
        gps: { lat: 3, lng: 4 },
        notes: 'Completed job',
      });

      expect(prisma.timeEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'entry_active' },
          data: expect.objectContaining({
            clockOut,
            gps: { lat: 3, lng: 4 },
            notes: 'Completed job',
          }),
        }),
      );

      expect(result).toEqual(
        expect.objectContaining({
          id: 'entry_active',
          clockOut: clockOut.toISOString(),
          durationSeconds: 5400,
          notes: 'Completed job',
        }),
      );
    });
  });
});
