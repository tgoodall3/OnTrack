import { BadRequestException, Injectable } from '@nestjs/common';
import { ContactType, LeadStage, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListLeadsDto } from './dto/list-leads.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { RequestContextService } from '../context/request-context.service';

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

export interface LeadActivityEntry {
  id: string;
  action: string;
  createdAt: string;
  actor?: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
  meta?: Prisma.JsonValue | null;
}

export interface LeadImportResult {
  created: number;
  failed: number;
  errors: Array<{ row: number; error: string }>;
  leads: LeadSummary[];
}

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

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
    const tenantId = this.prisma.getTenantIdOrThrow();
    return this.createForTenant(tenantId, dto);
  }

  async createForTenant(
    tenantId: string,
    dto: CreateLeadDto,
  ): Promise<LeadSummary> {
    if (!dto.contactId && !dto.contact) {
      throw new BadRequestException('Contact information is required');
    }

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

    await this.logActivity(tenantId, lead.id, 'lead.created', {
      stage: lead.stage,
      source: lead.source ?? undefined,
    });

    return this.toSummary(lead);
  }

  async importFromCsv(
    csvContent: string,
    defaultStage?: LeadStage,
  ): Promise<LeadImportResult> {
    const tenantId = this.prisma.getTenantIdOrThrow();
    const { headers, records } = parseCsvContent(csvContent);

    if (!headers.includes('name')) {
      throw new BadRequestException('CSV is missing required "name" column');
    }

    const createdLeads: LeadSummary[] = [];
    const errors: Array<{ row: number; error: string }> = [];

    for (const record of records) {
      try {
        const name = record.values['name']?.trim();
        if (!name) {
          throw new BadRequestException('Contact name is required');
        }

        const stageValue = record.values['stage'];
        const resolvedStage =
          coerceStage(stageValue) ??
          (defaultStage ? coerceStage(defaultStage) : undefined);

        const dto: CreateLeadDto = {
          contact: {
            name,
            email: optional(record.values['email']),
            phone: optional(record.values['phone']),
          },
          source: optional(record.values['source']),
          notes: optional(record.values['notes']),
        };

        if (resolvedStage) {
          dto.stage = resolvedStage;
        }

        const propertyLine1 =
          optional(record.values['property_line1']) ??
          optional(record.values['address_line1']);
        if (propertyLine1) {
          dto.propertyAddress = {
            line1: propertyLine1,
            line2:
              optional(record.values['property_line2']) ??
              optional(record.values['address_line2']),
            city:
              optional(record.values['property_city']) ??
              optional(record.values['city']),
            state:
              optional(record.values['property_state']) ??
              optional(record.values['state']),
            postalCode:
              optional(record.values['property_postal_code']) ??
              optional(record.values['postal_code']),
          };
        }

        const summary = await this.createForTenant(tenantId, dto);
        createdLeads.push(summary);
      } catch (error) {
        errors.push({
          row: record.rowNumber,
          error:
            error instanceof Error
              ? error.message
              : 'Unknown error while importing row',
        });
      }
    }

    return {
      created: createdLeads.length,
      failed: errors.length,
      errors,
      leads: createdLeads,
    };
  }

  async update(id: string, dto: UpdateLeadDto): Promise<LeadSummary> {
    const data: Prisma.LeadUpdateInput = {};
    const tenantId = this.prisma.getTenantIdOrThrow();

    const existing = await this.prisma.lead.findUnique({
      where: { id },
      select: {
        stage: true,
        notes: true,
      },
    });

    if (!existing) {
      throw new BadRequestException('Lead not found');
    }

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

    if (dto.stage && dto.stage !== existing.stage) {
      await this.logActivity(tenantId, id, 'lead.stage_updated', {
        from: existing.stage,
        to: dto.stage,
      });
    }

    if (dto.notes !== undefined && dto.notes !== existing.notes) {
      await this.logActivity(tenantId, id, 'lead.notes_updated', {
        changed: true,
      });
    }

    return this.toSummary(lead);
  }

  async remove(id: string): Promise<void> {
    const tenantId = this.prisma.getTenantIdOrThrow();
    await this.prisma.lead.delete({
      where: { id },
    });
    await this.logActivity(tenantId, id, 'lead.deleted');
  }

  async activity(id: string): Promise<LeadActivityEntry[]> {
    const tenantId = this.prisma.getTenantIdOrThrow();
    const logs = await this.prisma.activityLog.findMany({
      where: {
        tenantId,
        entityType: 'lead',
        entityId: id,
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return logs.map((log) => ({
      id: log.id,
      action: log.action,
      createdAt: log.createdAt.toISOString(),
      actor: log.actor
        ? {
            id: log.actor.id,
            name: log.actor.name,
            email: log.actor.email,
          }
        : undefined,
      meta: log.meta ?? null,
    }));
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

  private async logActivity(
    tenantId: string,
    leadId: string,
    action: string,
    meta?: Record<string, unknown>,
  ) {
    const actorId = this.requestContext.context.userId;
    await this.prisma.activityLog.create({
      data: {
        tenantId,
        actorId,
        action,
        entityType: 'lead',
        entityId: leadId,
        meta: meta ? (meta as Prisma.JsonValue) : undefined,
      },
    });
  }
}

function parseCsvContent(content: string): {
  headers: string[];
  records: Array<{ rowNumber: number; values: Record<string, string> }>;
} {
  const rawLines = content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  if (rawLines.length === 0) {
    return { headers: [], records: [] };
  }

  const headers = splitCsvLine(rawLines[0]).map((header) =>
    header.trim().toLowerCase(),
  );

  const records = rawLines.slice(1).flatMap((line, index) => {
    const cells = splitCsvLine(line);
    const values: Record<string, string> = {};
    let hasValue = false;

    headers.forEach((header, columnIndex) => {
      const cell = cells[columnIndex] ?? '';
      if (cell.trim().length > 0) {
        hasValue = true;
      }
      values[header] = cell;
    });

    if (!hasValue) {
      return [];
    }

    return [
      {
        rowNumber: index + 2,
        values,
      },
    ];
  });

  return { headers, records };
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      const nextChar = line[i + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
}

function optional(value?: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function coerceStage(value?: string | LeadStage | null): LeadStage | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.toString().trim().toUpperCase();
  if (!normalized.length) {
    return undefined;
  }

  return (Object.values(LeadStage) as string[]).includes(normalized)
    ? (normalized as LeadStage)
    : undefined;
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
