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
  UseGuards,
} from '@nestjs/common';
import {
  ChecklistsService,
  ChecklistTemplateActivityEntry,
  ChecklistTemplateSummary,
  ChecklistTemplateUsage,
} from './checklists.service';
import { CreateChecklistTemplateDto } from './dto/create-template.dto';
import { UpdateChecklistTemplateDto } from './dto/update-template.dto';
import { TenantGuard } from '../tenancy/tenant.guard';
import { ListTemplatesDto } from './dto/list-templates.dto';

@Controller('checklists')
@UseGuards(TenantGuard)
export class ChecklistsController {
  constructor(private readonly checklistsService: ChecklistsService) {}

  @Get('templates')
  async listTemplates(
    @Query() query: ListTemplatesDto,
  ): Promise<ChecklistTemplateSummary[]> {
    return this.checklistsService.listTemplates(Boolean(query.archived));
  }

  @Post('templates')
  async createTemplate(
    @Body() dto: CreateChecklistTemplateDto,
  ): Promise<ChecklistTemplateSummary> {
    return this.checklistsService.createTemplate(dto);
  }

  @Patch('templates/:id')
  async updateTemplate(
    @Param('id') templateId: string,
    @Body() dto: UpdateChecklistTemplateDto,
  ): Promise<ChecklistTemplateSummary> {
    return this.checklistsService.updateTemplate(templateId, dto);
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

  @Delete('templates/:id')
  async deleteTemplate(@Param('id') templateId: string): Promise<{ deleted: true }> {
    await this.checklistsService.deleteTemplate(templateId);
    return { deleted: true };
  }

  @Get('templates/:id/activity')
  async templateActivity(
    @Param('id') templateId: string,
  ): Promise<ChecklistTemplateActivityEntry[]> {
    return this.checklistsService.templateActivity(templateId);
  }

  @Get('templates/:id/usage')
  async templateUsage(
    @Param('id') templateId: string,
  ): Promise<ChecklistTemplateUsage> {
    return this.checklistsService.templateUsage(templateId);
  }

  @Delete('templates/:id/apply')
  async removeTemplate(
    @Param('id') templateId: string,
    @Body('jobId') jobId: string,
  ): Promise<{ removed: true }> {
    if (!jobId) {
      throw new BadRequestException('jobId is required');
    }

    await this.checklistsService.removeTemplate(templateId, jobId);
    return { removed: true };
  }

  @Post('templates/:id/archive')
  async archiveTemplate(
    @Param('id') templateId: string,
  ): Promise<ChecklistTemplateSummary> {
    return this.checklistsService.archiveTemplate(templateId);
  }

  @Post('templates/:id/restore')
  async restoreTemplate(
    @Param('id') templateId: string,
  ): Promise<ChecklistTemplateSummary> {
    return this.checklistsService.restoreTemplate(templateId);
  }
}
