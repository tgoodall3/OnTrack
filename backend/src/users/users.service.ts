import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListUsersDto } from './dto/list-users.dto';

export interface UserSummary {
  id: string;
  name?: string | null;
  email: string;
  active: boolean;
  roles: Array<{
    id: string;
    name: string;
    key?: string | null;
  }>;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: ListUsersDto): Promise<UserSummary[]> {
    const tenantId = this.prisma.getTenantIdOrThrow();

    const where: Prisma.UserWhereInput = {
      tenantId,
    };

    if (params.active !== undefined) {
      where.active = params.active;
    }

    if (params.search) {
      const search = params.search.trim();
      if (search.length > 0) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ];
      }
    }

    const take = params.take ?? 50;

    const users = await this.prisma.user.findMany({
      where,
      take,
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
    });

    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      active: user.active,
      roles: user.roleAssignments
        .map((assignment) => assignment.role)
        .filter((role): role is NonNullable<typeof role> => role !== null)
        .map((role) => ({
          id: role.id,
          name: role.name,
          key: role.key ?? null,
        })),
    }));
  }
}
