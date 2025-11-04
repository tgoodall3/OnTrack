import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MaterialApprovalStatus } from '@prisma/client';

describe('MaterialsController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let httpServer: any;

  const tenantSlug = `tenant-${randomUUID().slice(0, 8)}`;
  const headers = () => ({ 'X-Tenant-ID': tenantSlug });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    prisma = moduleFixture.get(PrismaService);
    httpServer = app.getHttpServer();

    await prisma.tenant.create({
      data: {
        name: `Materials ${tenantSlug}`,
        slug: tenantSlug,
        plan: 'STANDARD',
      },
    });
  });

  afterAll(async () => {
    await prisma.materialUsage.deleteMany({ where: { tenant: { slug: tenantSlug } } });
    await prisma.job.deleteMany({ where: { tenant: { slug: tenantSlug } } });
    await prisma.user.deleteMany({ where: { tenant: { slug: tenantSlug } } });
    await prisma.tenant.deleteMany({ where: { slug: tenantSlug } });
    await app.close();
  });

  it('captures materials, approvals, and rejection notes', async () => {
    const tenant = await prisma.tenant.findFirstOrThrow({ where: { slug: tenantSlug } });

    const crew = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `crew.${tenantSlug}@example.com`,
        name: 'Crew Member',
      },
    });

    const supervisor = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `supervisor.${tenantSlug}@example.com`,
        name: 'Supervisor',
      },
    });

    const job = await prisma.job.create({
      data: {
        tenantId: tenant.id,
        status: 'IN_PROGRESS',
        notes: 'Material logging e2e job',
      },
    });

    const createRes = await request(httpServer)
      .post(`/api/jobs/${job.id}/materials`)
      .set(headers())
      .send({
        sku: 'PLY-BOARD-34',
        costCode: 'MAT-SUBFLOOR',
        quantity: 8,
        unitCost: 42.5,
        notes: '3/4" plywood',
        recordedById: crew.id,
      })
      .expect(201);

    expect(createRes.body.approvalStatus).toBe(MaterialApprovalStatus.SUBMITTED);
    expect(createRes.body.recordedBy?.id).toBe(crew.id);

    const materialId = createRes.body.id as string;

    const approveRes = await request(httpServer)
      .post(`/api/jobs/${job.id}/materials/${materialId}/approve`)
      .set(headers())
      .send({ approverId: supervisor.id, note: 'Approved for billing' })
      .expect(201);

    expect(approveRes.body.approvalStatus).toBe(MaterialApprovalStatus.APPROVED);
    expect(approveRes.body.approvalNote).toBe('Approved for billing');

    const secondRes = await request(httpServer)
      .post(`/api/jobs/${job.id}/materials`)
      .set(headers())
      .send({
        sku: 'SEALANT-TUBE',
        quantity: 6,
        unitCost: 9.75,
        notes: 'Sealant tubes',
        recordedById: crew.id,
      })
      .expect(201);

    const secondId = secondRes.body.id as string;

    const rejectRes = await request(httpServer)
      .post(`/api/jobs/${job.id}/materials/${secondId}/reject`)
      .set(headers())
      .send({ approverId: supervisor.id, reason: 'Need supplier receipt', note: 'Upload invoice copy' })
      .expect(201);

    expect(rejectRes.body.approvalStatus).toBe(MaterialApprovalStatus.REJECTED);
    expect(rejectRes.body.rejectionReason).toBe('Need supplier receipt');
    expect(rejectRes.body.approvalNote).toBe('Upload invoice copy');

    const listRes = await request(httpServer)
      .get(`/api/jobs/${job.id}/materials`)
      .set(headers())
      .expect(200);

    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body).toHaveLength(2);

    const approvedEntry = listRes.body.find((entry: any) => entry.id === materialId);
    expect(approvedEntry.approvalStatus).toBe(MaterialApprovalStatus.APPROVED);
    expect(approvedEntry.totalCost).toBeCloseTo(340, 0);

    const rejectedEntry = listRes.body.find((entry: any) => entry.id === secondId);
    expect(rejectedEntry.approvalStatus).toBe(MaterialApprovalStatus.REJECTED);
    expect(rejectedEntry.rejectionReason).toBe('Need supplier receipt');
  });
});
