import { BadRequestException, Injectable } from '@nestjs/common';
import { ContactType, LeadStage, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListLeadsDto } from './dto/list-leads.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';

type LeadWithRelations = Prisma.LeadGetPayload<{
  include: {
    contact: true;
    property: true;
    estimates: { select: { id: true; status: true } };
    jobs: { select: { id: true; status: true } };
  };
}>;

export interface LeadSummary {
  id: string;
  stage: LeadStage;
  source?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  contact: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
  };
  property?: {
    id: string;
    address: string;
  };
  metrics: {
    estimates: number;
    jobs: number;
  };
}

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: ListLeadsDto): Promise<LeadSummary[]> {
    const take = params.take ?? 25;
    const where: Prisma.LeadWhereInput = {};

    if (params.stage) {
      where.stage = params.stage;
    }

    if (params.search) {
      const search = params.search.trim();
      if (search.length) {
        where.OR = [
          { contact: { name: { contains: search, mode: 'insensitive' } } },
          { contact: { email: { contains: search, mode: 'insensitive' } } },
          { contact: { phone: { contains: search, mode: 'insensitive' } } },
          { source: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
        ];
      }
    }

    const leads = await this.prisma.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        contact: true,
        property: true,
        estimates: { select: { id: true, status: true } },
        jobs: { select: { id: true, status: true } },
      },
    });

    return leads.map((lead) => this.toSummary(lead));
  }

  async findOne(id: string): Promise<LeadSummary> {
    const lead = await this.prisma.lead.findFirst({
      where: { id },
      include: {
        contact: true,
        property: true,
        estimates: { select: { id: true, status: true } },
        jobs: { select: { id: true, status: true } },
      },
    });

    if (!lead) {
      throw new BadRequestException('Lead not found');
    }

    return this.toSummary(lead);
  }

  async create(dto: CreateLeadDto): Promise<LeadSummary> {
    if (!dto.contactId && !dto.contact) {
      throw new BadRequestException('Contact information is required');
    }

    const tenantId = this.prisma.getTenantIdOrThrow();

    const contactRelation = dto.contactId
      ? { connect: { id: dto.contactId } }
      : ({
          create: {
            name: dto.contact!.name,
            email: dto.contact!.email,
            phone: dto.contact!.phone,
            type: ContactType.CLIENT,
            tenant: { connect: { id: tenantId } },
          },
        } as Prisma.ContactCreateNestedOneWithoutLeadsInput);

    let propertyRelation:
      | Prisma.PropertyCreateNestedOneWithoutLeadsInput
      | undefined;

    if (dto.propertyId) {
      propertyRelation = { connect: { id: dto.propertyId } };
    } else if (dto.propertyAddress) {
      propertyRelation = {
        create: {
          address: toAddressJson(dto.propertyAddress),
          tenant: { connect: { id: tenantId } },
          ...(dto.contactId
            ? { contact: { connect: { id: dto.contactId } } }
            : {}),
        },
      };
    }

    const lead = await this.prisma.lead.create({
      data: {
        tenant: { connect: { id: tenantId } },
        stage: dto.stage ?? LeadStage.NEW,
        source: dto.source,
        notes: dto.notes,
        contact: contactRelation,
        ...(propertyRelation ? { property: propertyRelation } : {}),
      },
      include: {
        contact: true,
        property: true,
        estimates: { select: { id: true, status: true } },
        jobs: { select: { id: true, status: true } },
      },
    });

    return this.toSummary(lead);
  }

  async update(id: string, dto: UpdateLeadDto): Promise<LeadSummary> {
    const data: Prisma.LeadUpdateInput = {};

    if (dto.stage) data.stage = dto.stage;
    if (dto.source !== undefined) data.source = dto.source;
    if (dto.notes !== undefined) data.notes = dto.notes;

    if (dto.contactId) {
      data.contact = { connect: { id: dto.contactId } };
    }

    if (dto.propertyId) {
      data.property = { connect: { id: dto.propertyId } };
    }

    const lead = await this.prisma.lead.update({
      where: { id },
      data,
      include: {
        contact: true,
        property: true,
        estimates: { select: { id: true, status: true } },
        jobs: { select: { id: true, status: true } },
      },
    });

    return this.toSummary(lead);
  }

  async remove(id: string): Promise<void> {
    await this.prisma.lead.delete({
      where: { id },
    });
  }

  private toSummary(lead: LeadWithRelations): LeadSummary {
    return {
      id: lead.id,
      stage: lead.stage,
      source: lead.source,
      notes: lead.notes,
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.updatedAt.toISOString(),
      contact: {
        id: lead.contact.id,
        name: lead.contact.name,
        email: lead.contact.email,
        phone: lead.contact.phone,
      },
      property: lead.property
        ? {
            id: lead.property.id,
            address: formatAddress(lead.property.address),
          }
        : undefined,
      metrics: {
        estimates: lead.estimates.length,
        jobs: lead.jobs.length,
      },
    };
  }
}

function formatAddress(address: Prisma.JsonValue | null): string {
  if (!address || typeof address !== 'object' || Array.isArray(address)) {
    return 'Address to be confirmed';
  }

  const record = address as Record<string, unknown>;
  const line1 = toString(record.line1);
  const line2 = toString(record.line2);
  const city = toString(record.city);
  const state = toString(record.state);
  const postalCode = toString(record.postalCode);

  const parts: string[] = [];
  if (line1) parts.push(line1);
  if (line2) parts.push(line2);

  const cityState = [city, state].filter(Boolean).join(', ');
  if (cityState) parts.push(cityState);
  if (postalCode) parts.push(postalCode);

  return parts.length ? parts.join(' ') : 'Address to be confirmed';
}

function toString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }
  return undefined;
}

function toAddressJson(
  address: NonNullable<CreateLeadDto['propertyAddress']>,
): Prisma.InputJsonValue {
  const result: Record<string, string> = {};

  if (address.line1) result.line1 = address.line1.trim();
  if (address.line2) result.line2 = address.line2.trim();
  if (address.city) result.city = address.city.trim();
  if (address.state) result.state = address.state.trim();
  if (address.postalCode) result.postalCode = address.postalCode.trim();

  return result;
}
