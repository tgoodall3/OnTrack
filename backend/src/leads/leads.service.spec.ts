import { Test } from '@nestjs/testing';
import { LeadStage } from '@prisma/client';
import { LeadsService } from './leads.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContextService } from '../context/request-context.service';

describe('LeadsService', () => {
  let service: LeadsService;
  let prisma: {
    lead: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    activityLog: {
      create: jest.Mock;
      findMany: jest.Mock;
    };
    getTenantIdOrThrow: jest.Mock;
  };
  let requestContext: {
    context: {
      userId?: string;
    };
  };

  beforeEach(async () => {
    prisma = {
      lead: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      activityLog: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      getTenantIdOrThrow: jest.fn(),
    };

    requestContext = {
      context: {},
    };

    const module = await Test.createTestingModule({
      providers: [
        LeadsService,
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

    service = module.get(LeadsService);
  });

  it('maps lead summaries with safe address formatting', async () => {
    prisma.lead.findMany.mockResolvedValue([
      {
        id: 'lead_1',
        stage: LeadStage.NEW,
        source: 'Web form',
        notes: null,
        createdAt: new Date('2024-01-01T12:00:00Z'),
        updatedAt: new Date('2024-01-02T12:00:00Z'),
        contact: {
          id: 'contact_1',
          name: 'Alex Rivera',
          email: 'alex@example.com',
          phone: null,
        },
        property: {
          id: 'property_1',
          address: {
            line1: '2415 Pinecrest Ave',
            city: 'Denver',
            state: 'CO',
          },
        },
        estimates: [{ id: 'estimate_1', status: 'SENT' }],
        jobs: [],
      } as any,
    ]);

    const result = await service.list({ take: 10 });

    expect(result).toEqual([
      expect.objectContaining({
        id: 'lead_1',
        stage: LeadStage.NEW,
        contact: expect.objectContaining({
          name: 'Alex Rivera',
          email: 'alex@example.com',
        }),
        property: expect.objectContaining({
          address: expect.stringContaining('Denver'),
        }),
        metrics: {
          estimates: 1,
          jobs: 0,
        },
      }),
    ]);
  });
});
