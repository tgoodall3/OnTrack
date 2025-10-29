import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Lead → Estimate → Job flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const tenantId = 'demo-contractors';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires approval before scheduling and persists job + files after approval', async () => {
    const httpServer = app.getHttpServer();
    const uniqueSuffix = randomUUID().slice(0, 8).toLowerCase();

    const ids: {
      leadId?: string;
      estimateId?: string;
      jobId?: string;
      fileId?: string;
    } = {};

    try {
      const leadRes = await request(httpServer)
        .post('/api/leads')
        .set('X-Tenant-ID', tenantId)
        .send({
          contact: { name: `Phase Two Client ${uniqueSuffix}` },
          source: 'integration-test',
        })
        .expect(201);

      ids.leadId = leadRes.body.id;

      const estimateRes = await request(httpServer)
        .post('/api/estimates')
        .set('X-Tenant-ID', tenantId)
        .send({
          leadId: ids.leadId,
          notes: 'Integration test estimate',
          lineItems: [
            {
              description: 'Integration labour',
              quantity: 1,
              unitPrice: 2500,
            },
          ],
        })
        .expect(201);

      ids.estimateId = estimateRes.body.id;

      const scheduledStart = new Date(Date.now() + 86_400_000).toISOString();

      await request(httpServer)
        .post('/api/jobs')
        .set('X-Tenant-ID', tenantId)
        .send({
          estimateId: ids.estimateId,
          scheduledStart,
          status: 'SCHEDULED',
        })
        .expect(400)
        .expect(({ body }) => {
          expect(body.message).toContain(
            'Estimate must be approved before creating a job.',
          );
        });

      const recipientEmail = `client+${uniqueSuffix}@example.com`;

      await request(httpServer)
        .post(`/api/estimates/${ids.estimateId}/send`)
        .set('X-Tenant-ID', tenantId)
        .send({
          recipientEmail,
          recipientName: 'Integration Client',
          message: 'Please review and approve.',
        })
        .expect(201);

      await request(httpServer)
        .post(`/api/estimates/${ids.estimateId}/approve`)
        .set('X-Tenant-ID', tenantId)
        .send({
          approverName: 'Integration Client',
          approverEmail: recipientEmail,
        })
        .expect(201);

      const jobRes = await request(httpServer)
        .post('/api/jobs')
        .set('X-Tenant-ID', tenantId)
        .send({
          estimateId: ids.estimateId,
          status: 'SCHEDULED',
          scheduledStart,
          notes: 'Integration scheduled job',
        })
        .expect(201);

      ids.jobId = jobRes.body.id;
      expect(jobRes.body.scheduledStart).toBe(scheduledStart);
      expect(jobRes.body.status).toBe('SCHEDULED');

      const uploadRes = await request(httpServer)
        .post('/api/files/uploads')
        .set('X-Tenant-ID', tenantId)
        .send({
          estimateId: ids.estimateId,
          fileName: `proposal-${uniqueSuffix}.pdf`,
          mimeType: 'application/pdf',
          fileSize: 4096,
        })
        .expect(201);

      const uploadKey = uploadRes.body.key;

      const finalizeRes = await request(httpServer)
        .post('/api/files')
        .set('X-Tenant-ID', tenantId)
        .send({
          estimateId: ids.estimateId,
          key: uploadKey,
          fileName: `proposal-${uniqueSuffix}.pdf`,
          mimeType: 'application/pdf',
          fileSize: 4096,
        })
        .expect(201);

      ids.fileId = finalizeRes.body.id;
      expect(finalizeRes.body.scanStatus).toBe('CLEAN');

      const filesRes = await request(httpServer)
        .get(`/api/estimates/${ids.estimateId}/files`)
        .set('X-Tenant-ID', tenantId)
        .expect(200);

      expect(Array.isArray(filesRes.body)).toBe(true);
      expect(filesRes.body[0]?.scanStatus).toBe('CLEAN');
      expect(filesRes.body[0]?.processedAt).toBeTruthy();
    } finally {
      if (ids.fileId) {
        await prisma.file.deleteMany({ where: { id: ids.fileId } });
      }
      if (ids.jobId) {
        await prisma.job.deleteMany({ where: { id: ids.jobId } });
      }
      if (ids.estimateId) {
        await prisma.estimate.deleteMany({ where: { id: ids.estimateId } });
      }
      if (ids.leadId) {
        await prisma.lead.deleteMany({ where: { id: ids.leadId } });
      }
    }
  });
});
