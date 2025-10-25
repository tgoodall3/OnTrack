import {
  ContactType,
  EstimateStatus,
  JobStatus,
  LeadStage,
  Prisma,
  PrismaClient,
  RoleKey,
  TaskStatus,
  TenantPlan,
} from '@prisma/client';

const prisma = new PrismaClient();

const ROLE_NAME_MAP: Record<RoleKey, string> = {
  [RoleKey.OWNER]: 'Owner/Admin',
  [RoleKey.ADMIN]: 'Admin',
  [RoleKey.OFFICE]: 'Office Staff',
  [RoleKey.CREW]: 'Crew Member',
  [RoleKey.PROPERTY_MANAGER]: 'Property Manager',
  [RoleKey.CLIENT]: 'Client',
};

const CREW_MEMBERS = [
  {
    email: 'crew.alex@demo.contractors',
    name: 'Alex Rivera',
  },
  {
    email: 'crew.jordan@demo.contractors',
    name: 'Jordan Patel',
  },
];

function hoursFromNow(hours: number): Date {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date;
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function withTime(base: Date, hours: number, minutes = 0): Date {
  const date = new Date(base);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

async function ensureRoles(tenantId: string) {
  for (const roleKey of Object.values(RoleKey) as RoleKey[]) {
    const name = ROLE_NAME_MAP[roleKey];
    await prisma.role.upsert({
      where: {
        tenantId_name: {
          tenantId,
          name,
        },
      },
      update: {
        key: roleKey,
        updatedAt: new Date(),
      },
      create: {
        key: roleKey,
        name,
        tenantId,
      },
    });
  }

  const roles = await prisma.role.findMany({
    where: {
      tenantId,
    },
  });

  return Object.fromEntries(roles.map((role) => [role.key ?? RoleKey.CLIENT, role]));
}

async function ensureUserRole(userId: string, roleId: string) {
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId,
        roleId,
      },
    },
    update: {},
    create: {
      userId,
      roleId,
    },
  });
}

async function seedTenant() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo-contractors' },
    update: {
      plan: TenantPlan.PRO,
      updatedAt: new Date(),
    },
    create: {
      name: 'Demo Contractors',
      slug: 'demo-contractors',
      plan: TenantPlan.PRO,
    },
  });

  const rolesByKey = await ensureRoles(tenant.id);

  const owner = await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: tenant.id,
        email: 'owner@demo.contractors',
      },
    },
    update: {
      name: 'Demo Owner',
      updatedAt: new Date(),
    },
    create: {
      tenantId: tenant.id,
      email: 'owner@demo.contractors',
      name: 'Demo Owner',
    },
  });

  await ensureUserRole(owner.id, rolesByKey[RoleKey.OWNER].id);

  const crewMembers = [];

  for (const crew of CREW_MEMBERS) {
    const user = await prisma.user.upsert({
      where: {
        tenantId_email: {
          tenantId: tenant.id,
          email: crew.email,
        },
      },
      update: {
        name: crew.name,
        updatedAt: new Date(),
      },
      create: {
        tenantId: tenant.id,
        email: crew.email,
        name: crew.name,
      },
    });

    await ensureUserRole(user.id, rolesByKey[RoleKey.CREW].id);
    crewMembers.push(user);
  }

  const evergreenContact = await prisma.contact.upsert({
    where: { id: 'contact_demo_evergreen' },
    update: {
      name: 'Evergreen Property Group',
      email: 'hello@evergreen-property.com',
      phone: '303-555-0199',
      updatedAt: new Date(),
    },
    create: {
      id: 'contact_demo_evergreen',
      tenantId: tenant.id,
      type: ContactType.CLIENT,
      name: 'Evergreen Property Group',
      email: 'hello@evergreen-property.com',
      phone: '303-555-0199',
    },
  });

  const evergreenProperty = await prisma.property.upsert({
    where: { id: 'property_demo_evergreen' },
    update: {
      address: {
        line1: '2415 Pinecrest Ave',
        city: 'Denver',
        state: 'CO',
        postalCode: '80205',
      },
      updatedAt: new Date(),
    },
    create: {
      id: 'property_demo_evergreen',
      tenantId: tenant.id,
      contactId: evergreenContact.id,
      address: {
        line1: '2415 Pinecrest Ave',
        city: 'Denver',
        state: 'CO',
        postalCode: '80205',
      } satisfies Prisma.JsonObject,
    },
  });

  const riversideContact = await prisma.contact.upsert({
    where: { id: 'contact_demo_riverside' },
    update: {
      name: 'Riverside Apartments',
      email: 'facilities@riverside-apts.com',
      phone: '720-555-0114',
      updatedAt: new Date(),
    },
    create: {
      id: 'contact_demo_riverside',
      tenantId: tenant.id,
      type: ContactType.CLIENT,
      name: 'Riverside Apartments',
      email: 'facilities@riverside-apts.com',
      phone: '720-555-0114',
    },
  });

  const riversideProperty = await prisma.property.upsert({
    where: { id: 'property_demo_riverside' },
    update: {
      address: {
        line1: '455 Riverside Dr',
        city: 'Aurora',
        state: 'CO',
        postalCode: '80011',
      },
      updatedAt: new Date(),
    },
    create: {
      id: 'property_demo_riverside',
      tenantId: tenant.id,
      contactId: riversideContact.id,
      address: {
        line1: '455 Riverside Dr',
        city: 'Aurora',
        state: 'CO',
        postalCode: '80011',
      } satisfies Prisma.JsonObject,
    },
  });

  const newLead = await prisma.lead.upsert({
    where: { id: 'lead_demo_new' },
    update: {
      stage: LeadStage.NEW,
      updatedAt: new Date(),
    },
    create: {
      id: 'lead_demo_new',
      tenantId: tenant.id,
      contactId: evergreenContact.id,
      stage: LeadStage.NEW,
      notes: 'Web form submission looking for preventative maintenance contract.',
      createdAt: daysAgo(2),
    },
  });

  const scheduledLead = await prisma.lead.upsert({
    where: { id: 'lead_demo_site_visit' },
    update: {
      stage: LeadStage.SCHEDULED_VISIT,
      propertyId: evergreenProperty.id,
      updatedAt: new Date(),
    },
    create: {
      id: 'lead_demo_site_visit',
      tenantId: tenant.id,
      contactId: evergreenContact.id,
      propertyId: evergreenProperty.id,
      stage: LeadStage.SCHEDULED_VISIT,
      notes: 'Tenant requests lobby renovation with new finishes and lighting.',
      createdAt: daysAgo(10),
    },
  });

  const riversideLead = await prisma.lead.upsert({
    where: { id: 'lead_demo_riverside' },
    update: {
      stage: LeadStage.QUALIFIED,
      propertyId: riversideProperty.id,
      updatedAt: new Date(),
    },
    create: {
      id: 'lead_demo_riverside',
      tenantId: tenant.id,
      contactId: riversideContact.id,
      propertyId: riversideProperty.id,
      stage: LeadStage.QUALIFIED,
      notes: 'Roof repairs scheduled after insurance adjuster sign-off.',
      createdAt: daysAgo(5),
    },
  });

  const estimateSent = await prisma.estimate.upsert({
    where: { id: 'estimate_demo_sent' },
    update: {
      status: EstimateStatus.SENT,
      subtotal: new Prisma.Decimal(42500),
      tax: new Prisma.Decimal(3575),
      total: new Prisma.Decimal(46075),
      updatedAt: new Date(),
      lineItems: {
        deleteMany: {},
        create: [
          {
            description: 'Lobby demolition and haul-away',
            quantity: new Prisma.Decimal(1),
            unitPrice: new Prisma.Decimal(12000),
          },
          {
            description: 'Electrical rough-in and fixtures',
            quantity: new Prisma.Decimal(1),
            unitPrice: new Prisma.Decimal(14500),
          },
          {
            description: 'Finish carpentry and paint',
            quantity: new Prisma.Decimal(1),
            unitPrice: new Prisma.Decimal(16000),
          },
        ],
      },
    },
    create: {
      id: 'estimate_demo_sent',
      tenantId: tenant.id,
      leadId: scheduledLead.id,
      number: 'EST-1005',
      status: EstimateStatus.SENT,
      subtotal: new Prisma.Decimal(42500),
      tax: new Prisma.Decimal(3575),
      total: new Prisma.Decimal(46075),
      notes: 'Pricing valid for 30 days. Includes disposal fees.',
      lineItems: {
        create: [
          {
            description: 'Lobby demolition and haul-away',
            quantity: new Prisma.Decimal(1),
            unitPrice: new Prisma.Decimal(12000),
          },
          {
            description: 'Electrical rough-in and fixtures',
            quantity: new Prisma.Decimal(1),
            unitPrice: new Prisma.Decimal(14500),
          },
          {
            description: 'Finish carpentry and paint',
            quantity: new Prisma.Decimal(1),
            unitPrice: new Prisma.Decimal(16000),
          },
        ],
      },
    },
  });

  const estimateApproved = await prisma.estimate.upsert({
    where: { id: 'estimate_demo_approved' },
    update: {
      status: EstimateStatus.APPROVED,
      subtotal: new Prisma.Decimal(68500),
      tax: new Prisma.Decimal(5545),
      total: new Prisma.Decimal(74045),
      updatedAt: new Date(),
      lineItems: {
        deleteMany: {},
        create: [
          {
            description: 'Roof membrane replacement',
            quantity: new Prisma.Decimal(1),
            unitPrice: new Prisma.Decimal(42000),
          },
          {
            description: 'Flashing and sealing',
            quantity: new Prisma.Decimal(1),
            unitPrice: new Prisma.Decimal(15500),
          },
          {
            description: 'Contingency allowance',
            quantity: new Prisma.Decimal(1),
            unitPrice: new Prisma.Decimal(11000),
          },
        ],
      },
    },
    create: {
      id: 'estimate_demo_approved',
      tenantId: tenant.id,
      leadId: riversideLead.id,
      number: 'EST-1006',
      status: EstimateStatus.APPROVED,
      subtotal: new Prisma.Decimal(68500),
      tax: new Prisma.Decimal(5545),
      total: new Prisma.Decimal(74045),
      notes: 'Approved via portal 3 days ago.',
      lineItems: {
        create: [
          {
            description: 'Roof membrane replacement',
            quantity: new Prisma.Decimal(1),
            unitPrice: new Prisma.Decimal(42000),
          },
          {
            description: 'Flashing and sealing',
            quantity: new Prisma.Decimal(1),
            unitPrice: new Prisma.Decimal(15500),
          },
          {
            description: 'Contingency allowance',
            quantity: new Prisma.Decimal(1),
            unitPrice: new Prisma.Decimal(11000),
          },
        ],
      },
    },
  });

  const scheduledJob = await prisma.job.upsert({
    where: { id: 'job_demo_lobby_renovation' },
    update: {
      status: JobStatus.SCHEDULED,
      scheduledStart: hoursFromNow(6),
      scheduledEnd: hoursFromNow(30),
      propertyId: evergreenProperty.id,
      leadId: scheduledLead.id,
      estimateId: estimateSent.id,
      updatedAt: new Date(),
    },
    create: {
      id: 'job_demo_lobby_renovation',
      tenantId: tenant.id,
      status: JobStatus.SCHEDULED,
      scheduledStart: hoursFromNow(6),
      scheduledEnd: hoursFromNow(30),
      propertyId: evergreenProperty.id,
      leadId: scheduledLead.id,
      estimateId: estimateSent.id,
      notes: 'Prep crew onsite 1 hour before start to stage materials.',
    },
  });

  const activeJob = await prisma.job.upsert({
    where: { id: 'job_demo_roof_repair' },
    update: {
      status: JobStatus.IN_PROGRESS,
      scheduledStart: daysAgo(1),
      scheduledEnd: hoursFromNow(18),
      actualStart: daysAgo(1),
      propertyId: riversideProperty.id,
      leadId: riversideLead.id,
      estimateId: estimateApproved.id,
      updatedAt: new Date(),
    },
    create: {
      id: 'job_demo_roof_repair',
      tenantId: tenant.id,
      status: JobStatus.IN_PROGRESS,
      scheduledStart: daysAgo(1),
      scheduledEnd: hoursFromNow(18),
      actualStart: daysAgo(1),
      propertyId: riversideProperty.id,
      leadId: riversideLead.id,
      estimateId: estimateApproved.id,
      notes: 'Phase 1 tear-off complete. Waiting on delivery of flashing materials.',
    },
  });

  await prisma.task.upsert({
    where: { id: 'task_demo_material_drop' },
    update: {
      status: TaskStatus.IN_PROGRESS,
      assigneeId: crewMembers[0]?.id,
      dueAt: hoursFromNow(4),
      updatedAt: new Date(),
    },
    create: {
      id: 'task_demo_material_drop',
      tenantId: tenant.id,
      jobId: scheduledJob.id,
      title: 'Stage lobby materials and equipment',
      status: TaskStatus.IN_PROGRESS,
      assigneeId: crewMembers[0]?.id,
      dueAt: hoursFromNow(4),
    },
  });

  await prisma.task.upsert({
    where: { id: 'task_demo_safety_walk' },
    update: {
      status: TaskStatus.PENDING,
      assigneeId: crewMembers[1]?.id,
      dueAt: hoursFromNow(26),
      updatedAt: new Date(),
    },
    create: {
      id: 'task_demo_safety_walk',
      tenantId: tenant.id,
      jobId: scheduledJob.id,
      title: 'Conduct safety walk-through with building manager',
      status: TaskStatus.PENDING,
      assigneeId: crewMembers[1]?.id,
      dueAt: hoursFromNow(26),
    },
  });

  await prisma.task.upsert({
    where: { id: 'task_demo_roof_inspection' },
    update: {
      status: TaskStatus.IN_PROGRESS,
      assigneeId: crewMembers[0]?.id,
      updatedAt: new Date(),
    },
    create: {
      id: 'task_demo_roof_inspection',
      tenantId: tenant.id,
      jobId: activeJob.id,
      title: 'Inspect completed tear-off and prep decking',
      status: TaskStatus.IN_PROGRESS,
      assigneeId: crewMembers[0]?.id,
    },
  });

  await prisma.timeEntry.upsert({
    where: { id: 'time_demo_alex_monday' },
    update: {
      clockIn: withTime(daysAgo(2), 7, 30),
      clockOut: withTime(daysAgo(2), 15, 30),
      updatedAt: new Date(),
    },
    create: {
      id: 'time_demo_alex_monday',
      tenantId: tenant.id,
      jobId: activeJob.id,
      userId: crewMembers[0]?.id ?? owner.id,
      clockIn: withTime(daysAgo(2), 7, 30),
      clockOut: withTime(daysAgo(2), 15, 30),
    },
  });

  await prisma.timeEntry.upsert({
    where: { id: 'time_demo_jordan_monday' },
    update: {
      clockIn: withTime(daysAgo(2), 8, 0),
      clockOut: withTime(daysAgo(2), 16, 0),
      updatedAt: new Date(),
    },
    create: {
      id: 'time_demo_jordan_monday',
      tenantId: tenant.id,
      jobId: activeJob.id,
      userId: crewMembers[1]?.id ?? owner.id,
      clockIn: withTime(daysAgo(2), 8, 0),
      clockOut: withTime(daysAgo(2), 16, 0),
    },
  });

  await prisma.timeEntry.upsert({
    where: { id: 'time_demo_alex_today' },
    update: {
      clockIn: daysAgo(0),
      clockOut: null,
      updatedAt: new Date(),
    },
    create: {
      id: 'time_demo_alex_today',
      tenantId: tenant.id,
      jobId: activeJob.id,
      userId: crewMembers[0]?.id ?? owner.id,
      clockIn: daysAgo(0),
      clockOut: null,
    },
  });

  return {
    tenant,
    owner,
    crewMembers,
    jobs: {
      scheduledJob,
      activeJob,
    },
    leads: {
      newLead,
      scheduledLead,
      riversideLead,
    },
    estimates: {
      estimateSent,
      estimateApproved,
    },
  };
}

async function main() {
  await seedTenant();
}

void main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
