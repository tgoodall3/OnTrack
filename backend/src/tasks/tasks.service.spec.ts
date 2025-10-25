import { Test } from '@nestjs/testing';
import { TaskStatus } from '@prisma/client';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TasksService', () => {
  let service: TasksService;
  let prisma: {
    getTenantIdOrThrow: jest.Mock;
    job: { findFirst: jest.Mock };
    task: {
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      getTenantIdOrThrow: jest.fn(),
      job: { findFirst: jest.fn() },
      task: {
        findMany: jest.fn(),
      },
    };

    prisma.getTenantIdOrThrow.mockReturnValue('tenant_1');
    prisma.job.findFirst.mockResolvedValue({ id: 'job_1' });

    const module = await Test.createTestingModule({
      providers: [
        TasksService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get(TasksService);
  });

  it('returns task summaries with assignee details', async () => {
    prisma.task.findMany.mockResolvedValue([
      {
        id: 'task_1',
        title: 'Stage materials',
        status: TaskStatus.IN_PROGRESS,
        dueAt: new Date('2025-10-24T15:00:00Z'),
        checklistTemplateId: null,
        metadata: null,
        createdAt: new Date('2025-10-20T00:00:00Z'),
        updatedAt: new Date('2025-10-21T00:00:00Z'),
        assignee: {
          id: 'user_1',
          name: 'Alex Rivera',
          email: 'alex@example.com',
        },
      },
    ]);

    const result = await service.list('job_1', {});
    expect(result).toEqual([
      expect.objectContaining({
        id: 'task_1',
        title: 'Stage materials',
        status: TaskStatus.IN_PROGRESS,
        assignee: expect.objectContaining({
          name: 'Alex Rivera',
        }),
      }),
    ]);
  });
});
