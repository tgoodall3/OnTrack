import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { LeadsService, LeadSummary } from './leads.service';
import { ListLeadsDto } from './dto/list-leads.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { TenantGuard } from '../tenancy/tenant.guard';

@Controller('leads')
@UseGuards(TenantGuard)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  async list(@Query() query: ListLeadsDto): Promise<LeadSummary[]> {
    return this.leadsService.list(query);
  }

  @Get(':id')
  async detail(@Param('id') id: string): Promise<LeadSummary> {
    return this.leadsService.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateLeadDto): Promise<LeadSummary> {
    return this.leadsService.create(dto);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
  ): Promise<LeadSummary> {
    return this.leadsService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    await this.leadsService.remove(id);
  }
}
