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
    getTenantIdOrThrow: jest.Mock;
    estimate: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
      findUnique: jest.Mock;
    };
    estimateApproval: {
      create: jest.Mock;
    };
    file: {
      create: jest.Mock;
    };
    activityLog: {
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let requestContext: Pick<
    RequestContextService,
    'context' | 'setTenantId' | 'setUser'
  >;
  let storage: { uploadObject: jest.Mock; resolvePublicUrl: jest.Mock };
  let mailer: { sendEstimateEmail: jest.Mock };

  beforeEach(async () => {
    prisma = {
      getTenantIdOrThrow: jest.fn().mockReturnValue('tenant_1'),
      estimate: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      estimateApproval: {
        create: jest.fn(),
      },
      file: {
        create: jest.fn(),
      },
      activityLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.activityLog.create.mockResolvedValue(undefined);
    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        estimate: {
          update: jest.fn(),
        },
        estimateApproval: {
          create: jest.fn(),
        },
      }),
    );
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
    storage.uploadObject.mockResolvedValue(undefined);
    mailer = {
      sendEstimateEmail: jest.fn().mockResolvedValue({
        subject: 'Estimate ready',
        htmlPreview: '<p>Preview</p>',
        messageId: 'message-id',
      }),
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
          useValue: mailer,
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

  describe('estimate lifecycle', () => {
    it('sends and approves an estimate, persisting artifacts and logging activity', async () => {
      const baseEstimate = {
        id: 'est_1',
        number: 'EST-2042',
        status: EstimateStatus.DRAFT,
        subtotal: 4500,
        tax: 371.25,
        total: 4871.25,
        expiresAt: new Date('2025-11-01T00:00:00Z'),
        notes: null,
        createdAt: new Date('2025-10-24T00:00:00Z'),
        updatedAt: new Date('2025-10-24T00:00:00Z'),
        lead: {
          id: 'lead_1',
          stage: LeadStage.QUALIFIED,
          contact: { name: 'Morgan Avery' },
        },
        lineItems: [
          {
            id: 'li_1',
            description: 'Roof tune-up',
            quantity: 1,
            unitPrice: 4500,
          },
        ],
        approvals: [],
        job: null,
        template: null,
      };

      const sentApprovalRecord = {
        id: 'approval_send',
        status: EstimateStatus.SENT,
        createdAt: new Date('2025-10-24T12:10:00Z'),
        updatedAt: new Date('2025-10-24T12:10:00Z'),
        signature: {
          event: 'sent',
          recipientEmail: 'client@example.com',
          recipientName: 'Client Name',
          message: 'Please review',
          subject: 'Estimate EST-2042 from OnTrack',
          sentAt: new Date('2025-10-24T12:10:00Z').toISOString(),
          messageId: 'message-id',
        },
      };

      const approvedApprovalRecord = {
        id: 'approval_record',
        status: EstimateStatus.APPROVED,
        createdAt: new Date('2025-10-24T13:00:00Z'),
        updatedAt: new Date('2025-10-24T13:00:00Z'),
        signature: {
          event: 'approved',
          approverName: 'Client Name',
          approverEmail: 'client@example.com',
          approvedAt: new Date('2025-10-24T13:00:00Z').toISOString(),
        },
      };

      prisma.estimate.findFirst
        .mockResolvedValueOnce(baseEstimate)
        .mockResolvedValueOnce({
          ...baseEstimate,
          status: EstimateStatus.SENT,
          approvals: [sentApprovalRecord],
        })
        .mockResolvedValueOnce({
          ...baseEstimate,
          status: EstimateStatus.SENT,
          approvals: [sentApprovalRecord],
        })
        .mockResolvedValueOnce({
          ...baseEstimate,
          status: EstimateStatus.APPROVED,
          approvals: [approvedApprovalRecord, sentApprovalRecord],
        });

      const sendEstimateUpdate = jest.fn();
      const sendApprovalCreate = jest.fn();
      prisma.$transaction.mockImplementationOnce(async (callback) =>
        callback({
          estimate: {
            update: sendEstimateUpdate,
          },
          estimateApproval: {
            create: sendApprovalCreate,
          },
        }),
      );

      prisma.file.create.mockResolvedValue({
        id: 'file_1',
        url: 'https://files/tenants/tenant_1/estimates/est_1/latest.pdf',
        type: 'DOCUMENT',
        metadata: {},
        createdAt: new Date(),
        estimateId: 'est_1',
        jobId: null,
        invoiceId: null,
        uploadedBy: null,
      });

      const sendSummary = await service.send('est_1', {
        recipientEmail: 'client@example.com',
        recipientName: 'Client Name',
        message: 'Please review',
      });

      expect(sendSummary.status).toBe(EstimateStatus.SENT);
      expect(mailer.sendEstimateEmail).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'est_1', number: 'EST-2042' }),
        expect.objectContaining({ recipientEmail: 'client@example.com' }),
        expect.objectContaining({ pdf: expect.objectContaining({ fileName: expect.stringContaining('EST-2042') }) }),
      );
      expect(storage.uploadObject).toHaveBeenCalledWith(
        expect.stringContaining('est_1'),
        expect.any(Buffer),
        'application/pdf',
      );
      expect(prisma.file.create).toHaveBeenCalledWith(
        expect.objectContaining({
          estimate: { connect: { id: 'est_1' } },
        }),
      );
      expect(sendEstimateUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'est_1' },
          data: expect.objectContaining({ status: EstimateStatus.SENT }),
        }),
      );
      expect(sendApprovalCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: EstimateStatus.SENT }),
        }),
      );
      expect(prisma.activityLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'lead.estimate_sent',
          entityId: 'lead_1',
        }),
      );

      const approveEstimateUpdate = jest.fn();
      const approveApprovalCreate = jest.fn();
      prisma.$transaction.mockImplementationOnce(async (callback) =>
        callback({
          estimate: {
            update: approveEstimateUpdate,
          },
          estimateApproval: {
            create: approveApprovalCreate,
          },
        }),
      );

      const approveSummary = await service.approve('est_1', {
        approverName: 'Client Name',
        approverEmail: 'client@example.com',
      });

      expect(approveSummary.status).toBe(EstimateStatus.APPROVED);
      expect(approveEstimateUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'est_1' },
          data: expect.objectContaining({ status: EstimateStatus.APPROVED }),
        }),
      );
      expect(approveApprovalCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: EstimateStatus.APPROVED }),
        }),
      );
      expect(prisma.activityLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'lead.estimate_approved',
          entityId: 'lead_1',
        }),
      );
    });
  });
});
