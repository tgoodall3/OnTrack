import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListPropertiesDto } from './dto/list-properties.dto';

export interface PropertySummary {
  id: string;
  address: string;
  contact?: {
    id: string;
    name: string;
  };
}

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: ListPropertiesDto): Promise<PropertySummary[]> {
    const take = params.take ?? 25;
    const where: Prisma.PropertyWhereInput = {};

    if (params.search) {
      const search = params.search.trim();
      if (search.length) {
        where.OR = [
          { contact: { name: { contains: search, mode: 'insensitive' } } },
          { contact: { email: { contains: search, mode: 'insensitive' } } },
        ];
      }
    }

    const properties = await this.prisma.property.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        contact: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return properties.map((property) => ({
      id: property.id,
      address: formatAddress(property.address),
      contact: property.contact
        ? {
            id: property.contact.id,
            name: property.contact.name,
          }
        : undefined,
    }));
  }
}

function formatAddress(address: Prisma.JsonValue | null): string {
  if (!address || typeof address !== 'object' || Array.isArray(address)) {
    return 'Address to be confirmed';
  }

  const record = address as Record<string, unknown>;
  const segments = [
    toString(record.line1),
    toString(record.line2),
    [toString(record.city), toString(record.state)].filter(Boolean).join(', '),
    toString(record.postalCode),
  ]
    .filter(Boolean)
    .join(' ');

  return segments.length ? segments : 'Address to be confirmed';
}

function toString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }
  return undefined;
}
