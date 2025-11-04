import request from 'supertest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  JobStatus,
  TaskStatus,
  TimeEntryStatus,
} from '@prisma/client';

describe('TimeEntriesController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let httpServer: any;

  const tenantSlug = `tenant-${randomUUID().slice(0, 8)}`;
  const headers = () => ({ 'X-Tenant-ID': tenantSlug });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();

    httpServer = app.getHttpServer();
    prisma = moduleRef.get(PrismaService);

    await prisma.tenant.create({
      data: {
        name: `Tenant ${tenantSlug}`,
        slug: tenantSlug,
        plan: 'STANDARD',
      },
    });
  });

  afterAll(async () => {
    await prisma.timeEntry.deleteMany({
      where: { tenant: { slug: tenantSlug } },
    });
    await prisma.job.deleteMany({
      where: { tenant: { slug: tenantSlug } },
    });
    await prisma.task.deleteMany({
      where: { tenant: { slug: tenantSlug } },
    });
    await prisma.user.deleteMany({
      where: { tenant: { slug: tenantSlug } },
    });
    await prisma.tenant.deleteMany({
      where: { slug: tenantSlug },
    });
    await app.close();
  });

  const createJobFixture = async () => {
    const tenant = await prisma.tenant.findFirstOrThrow({
      where: { slug: tenantSlug },
    });

    const crewUser = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `crew+${randomUUID().slice(0, 6)}@example.com`,
        name: 'Crew Member',
      },
    });

    const supervisor = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `supervisor+${randomUUID().slice(0, 6)}@example.com`,
        name: 'Supervisor',
      },
    });

    const job = await prisma.job.create({
      data: {
        tenantId: tenant.id,
        status: JobStatus.SCHEDULED,
        notes: 'E2E job',
      },
    });

    // minimal task so crew schedule queries have data if exercised
    await prisma.task.create({
      data: {
        tenantId: tenant.id,
        jobId: job.id,
        title: 'Prep roof deck',
        status: TaskStatus.IN_PROGRESS,
        assigneeId: crewUser.id,
      },
    });

    return { tenant, crewUser, supervisor, job };
  };

  it('handles clock lifecycle with approval and rejection flows', async () => {
    const { job, crewUser, supervisor } = await createJobFixture();

    const clockIn = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const clockOut = new Date().toISOString();

    // clock in
    const clockInResponse = await request(httpServer)
      .post(`/api/jobs/${job.id}/time-entries/clock-in`)
      .set(headers())
      .send({
        userId: crewUser.id,
        clockIn,
        notes: 'Starting shift',
        location: {
          lat: 45.523064,
          lng: -122.676483,
          accuracy: 10,
          capturedAt: clockIn,
        },
      })
      .expect(201);

    expect(clockInResponse.body.status).toBe(TimeEntryStatus.IN_PROGRESS);
    expect(clockInResponse.body.clockInLocation).toEqual(
      expect.objectContaining({ lat: 45.523064 }),
    );

    const entryId = clockInResponse.body.id as string;

    // clock out -> submitted
    const clockOutResponse = await request(httpServer)
      .post(`/api/jobs/${job.id}/time-entries/${entryId}/clock-out`)
      .set(headers())
      .send({
        userId: crewUser.id,
        clockOut,
        notes: 'Wrapping up',
        location: {
          lat: 45.528561,
          lng: -122.68107,
          accuracy: 12,
          capturedAt: clockOut,
        },
      })
      .expect(201);

    expect(clockOutResponse.body.status).toBe(TimeEntryStatus.SUBMITTED);
    expect(clockOutResponse.body.durationMinutes).toBeGreaterThan(0);
    expect(clockOutResponse.body.clockOutLocation).toEqual(
      expect.objectContaining({ lat: 45.528561 }),
    );

    // approve submitted entry
    const approveResponse = await request(httpServer)
      .post(`/api/jobs/${job.id}/time-entries/${entryId}/approve`)
      .set(headers())
      .send({
        approverId: supervisor.id,
        note: 'Looks good',
      })
      .expect(201);

    expect(approveResponse.body.status).toBe(TimeEntryStatus.APPROVED);
    expect(approveResponse.body.approvalNote).toBe('Looks good');
    expect(approveResponse.body.approverId).toBe(supervisor.id);

    // second entry for rejection path
    const rejectClockIn = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const rejectClockOut = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const secondEntryRes = await request(httpServer)
      .post(`/api/jobs/${job.id}/time-entries/clock-in`)
      .set(headers())
      .send({
        userId: crewUser.id,
        clockIn: rejectClockIn,
        notes: 'Second shift',
      })
      .expect(201);

    const secondEntryId = secondEntryRes.body.id as string;

    await request(httpServer)
      .post(`/api/jobs/${job.id}/time-entries/${secondEntryId}/clock-out`)
      .set(headers())
      .send({
        userId: crewUser.id,
        clockOut: rejectClockOut,
        notes: 'Need clarification',
      })
      .expect(201);

    const rejectResponse = await request(httpServer)
      .post(`/api/jobs/${job.id}/time-entries/${secondEntryId}/reject`)
      .set(headers())
      .send({
        approverId: supervisor.id,
        reason: 'Missing travel time',
        note: 'Please adjust hours',
      })
      .expect(201);

    expect(rejectResponse.body.status).toBe(
      TimeEntryStatus.ADJUSTMENT_REQUESTED,
    );
    expect(rejectResponse.body.rejectionReason).toBe('Missing travel time');
    expect(rejectResponse.body.approvalNote).toBe('Please adjust hours');

    // list endpoint should show both entries with their statuses
    const listResponse = await request(httpServer)
      .get(`/api/jobs/${job.id}/time-entries`)
      .set(headers())
      .expect(200);

    const statuses = listResponse.body.map(
      (entry: { status: TimeEntryStatus }) => entry.status,
    );
    expect(statuses).toContain(TimeEntryStatus.APPROVED);
    expect(statuses).toContain(TimeEntryStatus.ADJUSTMENT_REQUESTED);
  });
});

