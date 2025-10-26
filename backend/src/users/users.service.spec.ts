import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UsersService', () => {
  const getTenantIdOrThrowMock = jest.fn();
  const findManyMock = jest.fn();
  const prismaMock = {
    getTenantIdOrThrow: getTenantIdOrThrowMock,
    user: {
      findMany: findManyMock,
    },
  } as unknown as PrismaService;

  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    getTenantIdOrThrowMock.mockReturnValue('tenant-123');
    service = new UsersService(prismaMock as PrismaService);
  });

  it('requests users scoped to tenant with search filtering', async () => {
    findManyMock.mockResolvedValue([]);

    await service.list({ search: 'alex', take: 20 });

    expect(getTenantIdOrThrowMock).toHaveBeenCalledTimes(1);
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-123',
          OR: [
            { name: { contains: 'alex', mode: 'insensitive' } },
            { email: { contains: 'alex', mode: 'insensitive' } },
          ],
        }),
        take: 20,
        orderBy: [
          { name: 'asc' },
          { email: 'asc' },
        ],
        include: {
          roleAssignments: {
            include: {
              role: {
                select: {
                  id: true,
                  name: true,
                  key: true,
                },
              },
            },
          },
        },
      }),
    );
  });

  it('maps users and roles to summaries', async () => {
    findManyMock.mockResolvedValue([
      {
        id: 'user-1',
        name: 'Olivia Crew',
        email: 'olivia@example.com',
        active: true,
        roleAssignments: [
          {
            role: {
              id: 'role-1',
              name: 'Crew Lead',
              key: 'CREW',
            },
          },
          {
            role: null,
          },
        ],
      },
      {
        id: 'user-2',
        name: null,
        email: 'disengaged@example.com',
        active: false,
        roleAssignments: [],
      },
    ]);

    const result = await service.list({});

    expect(result).toEqual([
      {
        id: 'user-1',
        name: 'Olivia Crew',
        email: 'olivia@example.com',
        active: true,
        roles: [
          {
            id: 'role-1',
            name: 'Crew Lead',
            key: 'CREW',
          },
        ],
      },
      {
        id: 'user-2',
        name: null,
        email: 'disengaged@example.com',
        active: false,
        roles: [],
      },
    ]);
  });
});
