import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ChecklistsService, ChecklistTemplateSummary } from './checklists.service';
import { CreateChecklistTemplateDto } from './dto/create-template.dto';
import { TenantGuard } from '../tenancy/tenant.guard';

@Controller('checklists')
@UseGuards(TenantGuard)
export class ChecklistsController {
  constructor(private readonly checklistsService: ChecklistsService) {}

  @Get('templates')
  async listTemplates(): Promise<ChecklistTemplateSummary[]> {
    return this.checklistsService.listTemplates();
  }

  @Post('templates')
  async createTemplate(
    @Body() dto: CreateChecklistTemplateDto,
  ): Promise<ChecklistTemplateSummary> {
    return this.checklistsService.createTemplate(dto);
  }

  @Post('templates/:id/apply')
  async applyTemplate(
    @Param('id') templateId: string,
    @Body('jobId') jobId: string,
  ): Promise<{ applied: true }> {
    if (!jobId) {
      throw new BadRequestException('jobId is required');
    }

    await this.checklistsService.applyTemplate(templateId, jobId);
    return { applied: true };
  }
}
