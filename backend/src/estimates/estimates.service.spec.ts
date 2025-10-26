import { Test } from '@nestjs/testing';
import { EstimateStatus, JobStatus, LeadStage } from '@prisma/client';
import { EstimatesService } from './estimates.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContextService } from '../context/request-context.service';
import { EstimateMailerService } from './estimate-mailer.service';
import { StorageService } from '../storage/storage.service';

describe('EstimatesService', () => {
  let service: EstimatesService;
  let prisma: {
    estimate: {
      findMany: jest.Mock;
    };
  };
  let requestContext: Pick<
    RequestContextService,
    'context' | 'setTenantId' | 'setUser'
  >;
  let storage: { uploadObject: jest.Mock; resolvePublicUrl: jest.Mock };

  beforeEach(async () => {
    prisma = {
      estimate: {
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
    storage = {
      uploadObject: jest.fn(),
      resolvePublicUrl: jest.fn((key: string) => `https://files/${key}`),
    };

    const module = await Test.createTestingModule({
      providers: [
        EstimatesService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: RequestContextService,
          useValue: requestContext,
        },
        {
          provide: EstimateMailerService,
          useValue: {
            sendEstimateEmail: jest.fn(),
          },
        },
        {
          provide: StorageService,
          useValue: storage,
        },
      ],
    }).compile();

    service = module.get(EstimatesService);
  });

  it('returns summaries with line item totals', async () => {
    prisma.estimate.findMany.mockResolvedValue([
      {
        id: 'estimate_1',
        number: 'EST-1001',
        status: EstimateStatus.SENT,
        subtotal: 1000,
        tax: 82.5,
        total: 1082.5,
        expiresAt: new Date('2025-11-01T00:00:00Z'),
        notes: 'Sample',
        createdAt: new Date('2025-10-24T00:00:00Z'),
        updatedAt: new Date('2025-10-24T12:00:00Z'),
        lead: {
          id: 'lead_1',
          stage: LeadStage.QUALIFIED,
          contact: { name: 'Alex Rivera' },
        },
        lineItems: [
          {
            id: 'line_1',
            description: 'Labor',
            quantity: 10,
            unitPrice: 50,
          },
        ],
        approvals: [],
        job: {
          id: 'job_1',
          status: JobStatus.SCHEDULED,
          scheduledStart: new Date('2025-11-02T12:00:00Z'),
        },
        template: {
          id: 'tmpl_1',
          name: 'Standard Deck',
        },
      },
    ]);

    const result = await service.list({ take: 10 });
    expect(result).toEqual([
      expect.objectContaining({
        id: 'estimate_1',
        number: 'EST-1001',
        subtotal: 1000,
        lineItems: [
          expect.objectContaining({
            total: 500,
          }),
        ],
        job: expect.objectContaining({
          id: 'job_1',
        }),
        template: {
          id: 'tmpl_1',
          name: 'Standard Deck',
        },
      }),
    ]);
  });
});
