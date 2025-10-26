import { Test } from '@nestjs/testing';
import { JobStatus, LeadStage } from '@prisma/client';
import { JobsService } from './jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContextService } from '../context/request-context.service';

describe('JobsService', () => {
  let service: JobsService;
  let prisma: {
    job: {
      findMany: jest.Mock;
    };
  };
  let requestContext: Pick<
    RequestContextService,
    'context' | 'setTenantId' | 'setUser'
  >;

  beforeEach(async () => {
    prisma = {
      job: {
        findMany: jest.fn(),
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
      }),
    ]);
  });
});
