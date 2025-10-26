import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { LeadsService, LeadSummary } from './leads.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePublicLeadDto } from './dto/create-public-lead.dto';
import { CreateLeadDto } from './dto/create-lead.dto';

@Controller('public/leads')
@UseGuards(ThrottlerGuard)
export class PublicLeadsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leadsService: LeadsService,
  ) {}

  @Post()
  async create(@Body() dto: CreatePublicLeadDto): Promise<LeadSummary> {
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        OR: [{ id: dto.tenant }, { slug: dto.tenant }],
      },
      select: { id: true },
    });

    if (!tenant) {
      throw new BadRequestException('Unknown tenant');
    }

    const leadDto: CreateLeadDto = {
      contact: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
      },
      source: dto.source ?? 'Public form',
      notes: dto.notes,
    };

    if (dto.propertyLine1) {
      leadDto.propertyAddress = {
        line1: dto.propertyLine1,
        line2: dto.propertyLine2,
        city: dto.propertyCity,
        state: dto.propertyState,
        postalCode: dto.propertyPostalCode,
      };
    }

    return this.leadsService.createForTenant(tenant.id, leadDto);
  }
}
