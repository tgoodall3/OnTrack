import { Test } from '@nestjs/testing';
import {
  EstimateStatus,
  JobStatus,
  LeadStage,
  TimeEntryStatus,
  TaskStatus,
} from '@prisma/client';
import { JobsService } from './jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContextService } from '../context/request-context.service';

describe('JobsService', () => {
  let service: JobsService;
  let prisma: {
    getTenantIdOrThrow: jest.Mock;
    job: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    estimate: {
      findFirst: jest.Mock;
    };
    activityLog: {
      create: jest.Mock;
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
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      estimate: {
        findFirst: jest.fn(),
      },
      activityLog: {
        create: jest.fn(),
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
        JobsService,
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

    service = module.get(JobsService);
  });

  it('maps job summaries with property address', async () => {
    prisma.job.findMany.mockResolvedValue([
      {
        id: 'job_1',
        status: JobStatus.SCHEDULED,
        notes: null,
        scheduledStart: new Date('2025-10-24T08:00:00Z'),
        scheduledEnd: new Date('2025-10-24T17:00:00Z'),
        actualStart: null,
        actualEnd: null,
        createdAt: new Date('2025-10-20T00:00:00Z'),
        updatedAt: new Date('2025-10-21T00:00:00Z'),
        lead: {
          id: 'lead_1',
          stage: LeadStage.SCHEDULED_VISIT,
          contact: { name: 'Alex Rivera' },
        },
        estimate: {
          id: 'estimate_1',
          number: 'EST-1001',
          status: 'SENT',
        },
        property: {
          id: 'property_1',
          address: {
            line1: '2415 Pinecrest Ave',
            city: 'Denver',
            state: 'CO',
          },
        },
        tasks: [
          {
            id: 'task_1',
            title: 'Inspect site',
            status: 'IN_PROGRESS',
            dueAt: new Date('2025-10-24T12:00:00Z'),
            checklistTemplateId: 'tmpl_1',
            metadata: null,
            assignee: {
              id: 'crew_1',
              name: 'Jordan Diaz',
              email: 'jordan@example.com',
            },
          },
        ],
      },
    ]);

    const result = await service.list({});
    expect(result).toEqual([
      expect.objectContaining({
        id: 'job_1',
        property: expect.objectContaining({
          address: expect.stringContaining('Denver'),
        }),
        lead: expect.objectContaining({
          contactName: 'Alex Rivera',
        }),
        tasks: [
          expect.objectContaining({
            id: 'task_1',
            title: 'Inspect site',
            status: 'IN_PROGRESS',
            checklistTemplateId: 'tmpl_1',
            assignee: expect.objectContaining({
              id: 'crew_1',
              name: 'Jordan Diaz',
            }),
          }),
        ],
      }),
    ]);
  });

  it('filters jobs by assignee and returns mapped tasks', async () => {
    prisma.job.findMany.mockResolvedValue([
      {
        id: 'job_crew',
        status: JobStatus.IN_PROGRESS,
        notes: null,
        scheduledStart: null,
        scheduledEnd: null,
        actualStart: null,
        actualEnd: null,
        createdAt: new Date('2025-10-22T00:00:00Z'),
        updatedAt: new Date('2025-10-23T00:00:00Z'),
        lead: null,
        estimate: null,
        property: null,
        tasks: [
          {
            id: 'task_a',
            title: 'Demo crew task',
            status: 'COMPLETE',
            dueAt: null,
            checklistTemplateId: null,
            metadata: { priority: 'high' },
            assignee: {
              id: 'crew_7',
              name: 'Crew Member',
              email: 'crew@example.com',
            },
          },
        ],
      },
    ]);

    const result = await service.list({ assigneeId: 'crew_7' });

    expect(prisma.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tasks: {
            some: {
              assigneeId: 'crew_7',
            },
          },
        }),
      }),
    );

    expect(result[0]?.tasks).toEqual([
      expect.objectContaining({
        id: 'task_a',
        title: 'Demo crew task',
        status: 'COMPLETE',
        metadata: { priority: 'high' },
        assignee: expect.objectContaining({ id: 'crew_7' }),
      }),
    ]);
  });

  describe('create', () => {
    it('throws when estimate is not approved', async () => {
      prisma.estimate.findFirst.mockResolvedValue({
        id: 'est_pending',
        status: EstimateStatus.SENT,
        leadId: 'lead_1',
        lead: {
          propertyId: null,
        },
      });

      await expect(
        service.create({
          estimateId: 'est_pending',
          scheduledStart: new Date().toISOString(),
        }),
      ).rejects.toThrow('Estimate must be approved before creating a job.');

      expect(prisma.job.create).not.toHaveBeenCalled();
    });

    it('creates job when estimate is approved', async () => {
      const now = new Date();
      prisma.estimate.findFirst.mockResolvedValue({
        id: 'est_ready',
        status: EstimateStatus.APPROVED,
        leadId: 'lead_ready',
        lead: {
          propertyId: 'prop_ready',
        },
      });
      prisma.job.create.mockResolvedValue({
        id: 'job_ready',
        status: JobStatus.DRAFT,
        notes: null,
        scheduledStart: now,
        scheduledEnd: null,
        actualStart: null,
        actualEnd: null,
        createdAt: now,
        updatedAt: now,
        lead: {
          id: 'lead_ready',
          stage: LeadStage.QUALIFIED,
          contact: { name: 'Lead Ready' },
        },
        estimate: {
          id: 'est_ready',
          number: 'EST-2000',
          status: EstimateStatus.APPROVED,
        },
        property: {
          id: 'prop_ready',
          address: {
            line1: '1 Main St',
            city: 'Austin',
            state: 'TX',
          },
        },
        tasks: [],
      });

      const result = await service.create({
        estimateId: 'est_ready',
        scheduledStart: now.toISOString(),
        notes: 'Install crew',
      });

      expect(prisma.job.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            estimate: { connect: { id: 'est_ready' } },
            lead: { connect: { id: 'lead_ready' } },
            property: { connect: { id: 'prop_ready' } },
          }),
        }),
      );

      expect(prisma.activityLog.create).toHaveBeenCalledTimes(1);
      const activityPayload = prisma.activityLog.create.mock.calls[0]?.[0];
      expect(activityPayload?.data).toEqual(
        expect.objectContaining({
          action: 'lead.job_created',
          entityId: 'lead_ready',
        }),
      );

      expect(result).toEqual(
        expect.objectContaining({
          id: 'job_ready',
          estimate: expect.objectContaining({
            id: 'est_ready',
            status: EstimateStatus.APPROVED,
          }),
        }),
      );
    });
  });

  describe('update', () => {
    it('prevents scheduling when estimate is pending approval', async () => {
      prisma.job.findFirst.mockResolvedValue({
        id: 'job_blocked',
        estimate: {
          id: 'est_blocked',
          status: EstimateStatus.SENT,
        },
      });

      await expect(
        service.update('job_blocked', {
          scheduledStart: new Date().toISOString(),
        }),
      ).rejects.toThrow('Estimate must be approved before scheduling this job.');

      expect(prisma.job.update).not.toHaveBeenCalled();
    });

    it('allows scheduling when estimate is approved', async () => {
      const now = new Date();
      prisma.job.findFirst.mockResolvedValue({
        id: 'job_sched',
        estimate: {
          id: 'est_sched',
          status: EstimateStatus.APPROVED,
        },
      });
      prisma.job.update.mockResolvedValue({
        id: 'job_sched',
        status: JobStatus.SCHEDULED,
        notes: null,
        scheduledStart: now,
        scheduledEnd: null,
        actualStart: null,
        actualEnd: null,
        createdAt: now,
        updatedAt: now,
        lead: null,
        estimate: {
          id: 'est_sched',
          number: 'EST-1',
          status: EstimateStatus.APPROVED,
        },
        property: null,
        tasks: [],
      });

      const result = await service.update('job_sched', {
        scheduledStart: now.toISOString(),
        status: JobStatus.SCHEDULED,
      });

      expect(prisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job_sched' },
        }),
      );
      expect(result.scheduledStart).toBe(now.toISOString());
      expect(result.status).toBe(JobStatus.SCHEDULED);
    });
  });

  describe('crewSchedule', () => {
    it('throws when no assignee can be determined', async () => {
      requestContext.context.userId = undefined;

      await expect(service.crewSchedule({} as any)).rejects.toThrow(
        'Crew identity is required to load the schedule.',
      );
      expect(prisma.job.findMany).not.toHaveBeenCalled();
    });

    it('returns mapped schedule for current crew member', async () => {
      const scheduled = new Date('2025-11-05T08:30:00Z');
      prisma.job.findMany.mockResolvedValue([
        {
          id: 'job_sched',
          status: JobStatus.SCHEDULED,
          notes: 'Bring safety gear',
          scheduledStart: scheduled,
          scheduledEnd: null,
          actualStart: null,
          actualEnd: null,
          createdAt: scheduled,
          updatedAt: scheduled,
          lead: {
            id: 'lead_sched',
            stage: LeadStage.SCHEDULED_VISIT,
            contact: { name: 'Jordan Diaz' },
          },
          property: {
            id: 'prop_sched',
            address: {
              line1: '410 Elm St',
              city: 'Austin',
              state: 'TX',
            },
          },
          tasks: [
            {
              id: 'task_focus',
              title: 'Inspect roof',
              status: TaskStatus.IN_PROGRESS,
              dueAt: scheduled,
              metadata: { priority: 'high' },
              checklistTemplateId: 'tmpl_focus',
            },
          ],
          timeEntries: [
            {
              id: 'entry_active',
              jobId: 'job_sched',
              userId: 'user_1',
              tenantId: 'tenant_1',
              clockIn: scheduled,
              clockOut: null,
              status: TimeEntryStatus.IN_PROGRESS,
              durationMinutes: null,
              clockInLocation: null,
              clockOutLocation: null,
              notes: null,
              rejectionReason: null,
              submittedAt: null,
              submittedById: null,
              approverId: null,
              approvedAt: null,
              createdAt: scheduled,
              updatedAt: scheduled,
            },
          ],
        },
      ]);

      const result = await service.crewSchedule(
        { take: 10, includeCompleted: false },
        undefined,
      );

      expect(prisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant_1',
            status: { not: JobStatus.CANCELED },
            tasks: {
              some: {
                assigneeId: 'user_1',
              },
            },
          }),
          include: expect.objectContaining({
            tasks: expect.objectContaining({
              where: expect.objectContaining({
                assigneeId: 'user_1',
                status: { not: TaskStatus.COMPLETE },
              }),
            }),
            timeEntries: expect.objectContaining({
              where: expect.objectContaining({
                userId: 'user_1',
                clockOut: null,
              }),
              take: 1,
            }),
          }),
          take: 10,
        }),
      );

      expect(result).toEqual([
        {
          job: {
            id: 'job_sched',
            status: JobStatus.SCHEDULED,
            notes: 'Bring safety gear',
            scheduledStart: scheduled.toISOString(),
            scheduledEnd: null,
            createdAt: scheduled.toISOString(),
            updatedAt: scheduled.toISOString(),
            leadName: 'Jordan Diaz',
            propertyAddress: expect.stringContaining('Austin'),
            activeTimeEntryId: 'entry_active',
            activeClockIn: scheduled.toISOString(),
          },
          tasks: [
            {
              id: 'task_focus',
              title: 'Inspect roof',
              status: TaskStatus.IN_PROGRESS,
              dueAt: scheduled.toISOString(),
              metadata: { priority: 'high' },
              checklistTemplateId: 'tmpl_focus',
            },
          ],
        },
      ]);
    });
  });
});
