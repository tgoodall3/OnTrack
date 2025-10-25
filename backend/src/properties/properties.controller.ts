import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PropertiesService, PropertySummary } from './properties.service';
import { ListPropertiesDto } from './dto/list-properties.dto';
import { TenantGuard } from '../tenancy/tenant.guard';

@Controller('properties')
@UseGuards(TenantGuard)
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Get()
  async list(@Query() query: ListPropertiesDto): Promise<PropertySummary[]> {
    return this.propertiesService.list(query);
  }
}
