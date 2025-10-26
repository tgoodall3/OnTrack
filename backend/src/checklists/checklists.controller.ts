import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ChecklistsService,
  ChecklistTemplateActivityEntry,
  ChecklistTemplateSummary,
} from './checklists.service';
import { CreateChecklistTemplateDto } from './dto/create-template.dto';
import { UpdateChecklistTemplateDto } from './dto/update-template.dto';
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
}
