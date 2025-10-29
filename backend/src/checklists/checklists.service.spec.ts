import { Test, TestingModule } from '@nestjs/testing';
import { ChecklistsService } from './checklists.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContextService } from '../context/request-context.service';
import { BadRequestException } from '@nestjs/common';

const createMockPrisma = () => ({
  getTenantIdOrThrow: jest.fn().mockReturnValue('tenant-1'),
  checklistTemplate: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },
  task: {
    count: jest.fn(),
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    groupBy: jest.fn().mockResolvedValue([]),
  },
  checklistItem: {
    deleteMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  job: {
    findFirst: jest.fn(),
  },
  activityLog: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn(async (callback: (tx: any) => Promise<unknown>) => {
    const tx = {
      checklistTemplate: {
        update: jest.fn(),
        delete: jest.fn(),
      },
      checklistItem: {
        deleteMany: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      task: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };
    return callback(tx);
  }),
});

const mockRequestContext = {
  context: {
    userId: 'user-1',
  },
};

describe('ChecklistsService', () => {
  let service: ChecklistsService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChecklistsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: RequestContextService,
          useValue: mockRequestContext,
        },
      ],
    }).compile();

    service = module.get<ChecklistsService>(ChecklistsService);
  });

  describe('listTemplates', () => {
    it('returns only active templates by default', async () => {
      prisma.checklistTemplate.findMany.mockResolvedValue([
        {
          id: 'tpl_active',
          tenantId: 'tenant-1',
          name: 'Active checklist',
          description: null,
          isArchived: false,
          createdAt: new Date('2025-10-01T00:00:00Z'),
          updatedAt: new Date('2025-10-02T00:00:00Z'),
          items: [
            {
              id: 'item_1',
              templateId: 'tpl_active',
              title: 'Do the thing',
              order: 0,
            },
          ],
        },
      ]);
      prisma.task.groupBy
        .mockResolvedValueOnce([
          {
            checklistTemplateId: 'tpl_active',
            _count: { _all: 3 },
          },
        ])
        .mockResolvedValueOnce([
          {
            checklistTemplateId: 'tpl_active',
            jobId: 'job_1',
            _count: { _all: 2 },
          },
          {
            checklistTemplateId: 'tpl_active',
            jobId: 'job_2',
            _count: { _all: 1 },
          },
        ]);

      const results = await service.listTemplates();

      expect(prisma.checklistTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isArchived: false }),
        }),
      );
      expect(results).toHaveLength(1);
      expect(results[0].isArchived).toBe(false);
      expect(results[0].taskUsageCount).toBe(3);
      expect(results[0].jobUsageCount).toBe(2);
    });

    it('returns archived templates when requested', async () => {
      prisma.checklistTemplate.findMany.mockResolvedValue([
        {
          id: 'tpl_archived',
          tenantId: 'tenant-1',
          name: 'Archived checklist',
          description: null,
          isArchived: true,
          createdAt: new Date('2025-09-01T00:00:00Z'),
          updatedAt: new Date('2025-09-05T00:00:00Z'),
          items: [],
        },
      ]);

      const results = await service.listTemplates(true);

      expect(prisma.checklistTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isArchived: true }),
        }),
      );
      expect(results).toHaveLength(1);
      expect(results[0].isArchived).toBe(true);
      expect(results[0].taskUsageCount).toBe(0);
      expect(results[0].jobUsageCount).toBe(0);
    });
  });

  describe('deleteTemplate', () => {
    it('throws when template has task usage', async () => {
      prisma.checklistTemplate.findFirst.mockResolvedValue({
        id: 'tpl_1',
        name: 'Pre-flight',
        isArchived: false,
      });
      prisma.task.count.mockResolvedValue(3);

      await expect(service.deleteTemplate('tpl_1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.checklistTemplate.delete).not.toHaveBeenCalled();
    });

    it('deletes template when no task usage', async () => {
      prisma.checklistTemplate.findFirst.mockResolvedValue({
        id: 'tpl_1',
        name: 'Pre-flight',
        isArchived: false,
      });
      prisma.task.count.mockResolvedValue(0);

      await service.deleteTemplate('tpl_1');

      expect(prisma.$transaction).toHaveBeenCalled();
      const tx = (prisma.$transaction.mock.calls[0] as any[])[0];
      const txResult = await tx({
        checklistTemplate: {
          delete: jest.fn(),
        },
      });
      expect(txResult).toBeUndefined();
    });
  });

  describe('templateUsage', () => {
    it('returns structured usage data', async () => {
      prisma.checklistTemplate.findFirst.mockResolvedValue({
        id: 'tpl_1',
        name: 'Pre-flight',
        isArchived: false,
      });
      prisma.task.findMany.mockResolvedValue([
        {
          id: 'task_1',
          title: 'Inspect harness',
          status: 'PENDING',
          jobId: 'job_1',
          job: {
            id: 'job_1',
            status: 'IN_PROGRESS',
            estimate: { number: 'EST-100' },
            lead: { contact: { name: 'Drone HQ' } },
          },
        },
        {
          id: 'task_2',
          title: 'Check battery',
          status: 'COMPLETE',
          jobId: 'job_1',
          job: {
            id: 'job_1',
            status: 'IN_PROGRESS',
            estimate: { number: 'EST-100' },
            lead: { contact: { name: 'Drone HQ' } },
          },
        },
        {
          id: 'task_3',
          title: 'Review flight plan',
          status: 'PENDING',
          jobId: 'job_2',
          job: {
            id: 'job_2',
            status: 'DRAFT',
            estimate: null,
            lead: { contact: { name: null } },
          },
        },
      ]);

      const usage = await service.templateUsage('tpl_1');

      expect(usage.template).toEqual({ id: 'tpl_1', name: 'Pre-flight' });
      expect(usage.totalTasks).toBe(3);
      expect(usage.totalJobs).toBe(2);
      expect(usage.jobs).toEqual([
        {
          jobId: 'job_1',
          jobLabel: 'Drone HQ',
          jobStatus: 'IN_PROGRESS',
          taskCount: 2,
          sampleTasks: [
            {
              id: 'task_1',
              status: 'PENDING',
              title: 'Inspect harness',
            },
            {
              id: 'task_2',
              status: 'COMPLETE',
              title: 'Check battery',
            },
          ],
        },
        {
          jobId: 'job_2',
          jobLabel: 'Job JOB_2',
          jobStatus: 'DRAFT',
          taskCount: 1,
          sampleTasks: [
            {
              id: 'task_3',
              status: 'PENDING',
              title: 'Review flight plan',
            },
          ],
        },
      ]);
    });

    it('throws when template is not found', async () => {
      prisma.checklistTemplate.findFirst.mockResolvedValue(null);

      await expect(service.templateUsage('missing')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('archiveTemplate', () => {
    it('marks template as archived', async () => {
      const template = {
        id: 'tpl_1',
        tenantId: 'tenant-1',
        name: 'Checklist',
        description: null,
        isArchived: false,
        createdAt: new Date('2025-10-01T00:00:00Z'),
        updatedAt: new Date('2025-10-01T00:00:00Z'),
        items: [],
      };

      prisma.checklistTemplate.findFirst.mockResolvedValue(template);
      prisma.checklistTemplate.update.mockResolvedValue({
        ...template,
        isArchived: true,
      });
      prisma.task.groupBy
        .mockResolvedValueOnce([
          {
            checklistTemplateId: 'tpl_1',
            _count: { _all: 5 },
          },
        ])
        .mockResolvedValueOnce([
          {
            checklistTemplateId: 'tpl_1',
            jobId: 'job_a',
            _count: { _all: 3 },
          },
          {
            checklistTemplateId: 'tpl_1',
            jobId: 'job_b',
            _count: { _all: 2 },
          },
        ]);

      const result = await service.archiveTemplate('tpl_1');

      expect(prisma.checklistTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tpl_1' },
          data: { isArchived: true },
        }),
      );
      expect(result.isArchived).toBe(true);
      expect(result.taskUsageCount).toBe(5);
      expect(result.jobUsageCount).toBe(2);
    });

    it('returns early when already archived', async () => {
      const template = {
        id: 'tpl_archived',
        tenantId: 'tenant-1',
        name: 'Checklist',
        description: null,
        isArchived: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [],
      };

      prisma.checklistTemplate.findFirst.mockResolvedValue(template);
      prisma.task.groupBy
        .mockResolvedValueOnce([
          {
            checklistTemplateId: 'tpl_archived',
            _count: { _all: 4 },
          },
        ])
        .mockResolvedValueOnce([
          {
            checklistTemplateId: 'tpl_archived',
            jobId: 'job_x',
            _count: { _all: 1 },
          },
        ]);

      const result = await service.archiveTemplate('tpl_archived');

      expect(prisma.checklistTemplate.update).not.toHaveBeenCalled();
      expect(result.isArchived).toBe(true);
      expect(result.taskUsageCount).toBe(4);
      expect(result.jobUsageCount).toBe(1);
    });
  });

  describe('restoreTemplate', () => {
    it('restores an archived template', async () => {
      const template = {
        id: 'tpl_restore',
        tenantId: 'tenant-1',
        name: 'Checklist',
        description: null,
        isArchived: true,
        createdAt: new Date('2025-08-01T00:00:00Z'),
        updatedAt: new Date('2025-08-01T00:00:00Z'),
        items: [],
      };

      prisma.checklistTemplate.findFirst.mockResolvedValue(template);
      prisma.checklistTemplate.update.mockResolvedValue({
        ...template,
        isArchived: false,
      });
      prisma.task.groupBy
        .mockResolvedValueOnce([
          {
            checklistTemplateId: 'tpl_restore',
            _count: { _all: 6 },
          },
        ])
        .mockResolvedValueOnce([
          {
            checklistTemplateId: 'tpl_restore',
            jobId: 'job_y',
            _count: { _all: 4 },
          },
        ]);

      const result = await service.restoreTemplate('tpl_restore');

      expect(prisma.checklistTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tpl_restore' },
          data: { isArchived: false },
        }),
      );
      expect(result.isArchived).toBe(false);
      expect(result.taskUsageCount).toBe(6);
      expect(result.jobUsageCount).toBe(1);
    });

    it('returns early when already active', async () => {
      const template = {
        id: 'tpl_active',
        tenantId: 'tenant-1',
        name: 'Checklist',
        description: null,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [],
      };

      prisma.checklistTemplate.findFirst.mockResolvedValue(template);
      prisma.task.groupBy
        .mockResolvedValueOnce([
          {
            checklistTemplateId: 'tpl_active',
            _count: { _all: 0 },
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.restoreTemplate('tpl_active');

      expect(prisma.checklistTemplate.update).not.toHaveBeenCalled();
      expect(result.isArchived).toBe(false);
      expect(result.taskUsageCount).toBe(0);
      expect(result.jobUsageCount).toBe(0);
    });
  });
});
