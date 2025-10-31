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
import { TenantGuard } from '../tenancy/tenant.guard';
import { EstimateTemplatesService } from './estimate-templates.service';
import { CreateEstimateTemplateDto } from './dto/create-estimate-template.dto';
import { UpdateEstimateTemplateDto } from './dto/update-estimate-template.dto';
import { ApplyEstimateTemplateDto } from './dto/apply-estimate-template.dto';

@Controller('estimate-templates')
@UseGuards(TenantGuard)
export class EstimateTemplatesController {
  constructor(
    private readonly templatesService: EstimateTemplatesService,
  ) {}

  @Get()
  async list(@Query('includeArchived') includeArchived?: string) {
    const flag = includeArchived === 'true';
    return this.templatesService.list(flag);
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    return this.templatesService.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateEstimateTemplateDto) {
    return this.templatesService.create(dto);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateEstimateTemplateDto,
  ) {
    return this.templatesService.update(id, dto);
  }

  @Delete(':id')
  async archive(@Param('id') id: string) {
    return this.templatesService.archive(id);
  }

  @Delete(':id/permanent')
  async remove(@Param('id') id: string) {
    await this.templatesService.remove(id);
    return { deleted: true };
  }

  @Post(':id/restore')
  async restore(@Param('id') id: string) {
    return this.templatesService.restore(id);
  }

  @Post(':id/apply')
  async apply(
    @Param('id') id: string,
    @Body() dto: ApplyEstimateTemplateDto,
  ) {
    return this.templatesService.apply(id, dto.estimateId);
  }
}
