import { Test } from '@nestjs/testing';
import { EstimateTemplatesService } from './estimate-templates.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContextService } from '../context/request-context.service';
import { EstimatesService } from '../estimates/estimates.service';

describe('EstimateTemplatesService', () => {
  let service: EstimateTemplatesService;
  let prisma: {
    getTenantIdOrThrow: jest.Mock;
    estimateTemplate: {
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      getTenantIdOrThrow: jest.fn().mockReturnValue('tenant_1'),
      estimateTemplate: {
        findMany: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        EstimateTemplatesService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: RequestContextService,
          useValue: {
            context: {
              requestId: 'req-1',
              tenantId: 'tenant_1',
              userId: 'user_1',
            },
          },
        },
        {
          provide: EstimatesService,
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(EstimateTemplatesService);
  });

  it('returns template summaries ordered by item order', async () => {
    const createdAt = new Date('2025-10-01T12:00:00Z');
    prisma.estimateTemplate.findMany.mockResolvedValue([
      {
        id: 'tmpl_1',
        tenantId: 'tenant_1',
        name: 'Deck Repair',
        description: 'Labor + materials bundle',
        isArchived: false,
        createdAt,
        updatedAt: createdAt,
        items: [
          {
            id: 'item_b',
            description: 'Joist reinforcement',
            quantity: 2,
            unitPrice: 150,
            order: 2,
            createdAt,
            updatedAt: createdAt,
            templateId: 'tmpl_1',
          },
          {
            id: 'item_a',
            description: 'Deck inspection',
            quantity: 1,
            unitPrice: 75,
            order: 0,
            createdAt,
            updatedAt: createdAt,
            templateId: 'tmpl_1',
          },
        ],
      },
    ]);

    const result = await service.list();

    expect(prisma.getTenantIdOrThrow).toHaveBeenCalled();
    expect(result).toEqual([
      {
        id: 'tmpl_1',
        name: 'Deck Repair',
        description: 'Labor + materials bundle',
        isArchived: false,
        createdAt: createdAt.toISOString(),
        updatedAt: createdAt.toISOString(),
        items: [
          {
            id: 'item_a',
            description: 'Deck inspection',
            quantity: 1,
            unitPrice: 75,
            order: 0,
          },
          {
            id: 'item_b',
            description: 'Joist reinforcement',
            quantity: 2,
            unitPrice: 150,
            order: 2,
          },
        ],
      },
    ]);
  });
});
