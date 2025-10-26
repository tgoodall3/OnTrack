import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { memoryStorage } from 'multer';
import { FileInterceptor } from '@nestjs/platform-express';
import { LeadStage } from '@prisma/client';
import {
  LeadActivityEntry,
  LeadImportResult,
  LeadsService,
  LeadSummary,
} from './leads.service';
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

  @Get(':id/activity')
  async activity(@Param('id') id: string): Promise<LeadActivityEntry[]> {
    return this.leadsService.activity(id);
  }

  @Post()
  async create(@Body() dto: CreateLeadDto): Promise<LeadSummary> {
    return this.leadsService.create(dto);
  }

  @Post('import')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async import(
    @UploadedFile() file: Express.Multer.File,
    @Body('defaultStage') defaultStage?: string,
  ): Promise<LeadImportResult> {
    if (!file) {
      throw new BadRequestException('CSV file is required');
    }

    const stage = resolveStage(defaultStage);
    if (defaultStage && !stage) {
      throw new BadRequestException(`Invalid stage value "${defaultStage}"`);
    }

    const content = file.buffer.toString('utf8');
    return this.leadsService.importFromCsv(content, stage);
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

function resolveStage(value?: string): LeadStage | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();
  if (!normalized.length) {
    return undefined;
  }

  return (Object.values(LeadStage) as string[]).includes(normalized)
    ? (normalized as LeadStage)
    : undefined;
}
