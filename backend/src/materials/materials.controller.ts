import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { TenantGuard } from '../tenancy/tenant.guard';
import { MaterialsService, MaterialSummary } from './materials.service';
import { ListMaterialsDto } from './dto/list-materials.dto';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { ApproveMaterialDto, RejectMaterialDto } from './dto/review-material.dto';

@Controller('jobs/:jobId/materials')
@UseGuards(TenantGuard)
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Get()
  async list(
    @Param('jobId') jobId: string,
    @Query() query: ListMaterialsDto,
  ): Promise<MaterialSummary[]> {
    return this.materialsService.list(jobId, query);
  }

  @Post()
  async create(
    @Param('jobId') jobId: string,
    @Body() dto: CreateMaterialDto,
  ): Promise<MaterialSummary> {
    return this.materialsService.create(jobId, dto);
  }

  @Patch(':entryId')
  async update(
    @Param('jobId') jobId: string,
    @Param('entryId') entryId: string,
    @Body() dto: UpdateMaterialDto,
  ): Promise<MaterialSummary> {
    return this.materialsService.update(jobId, entryId, dto);
  }

  @Post(':entryId/approve')
  async approve(
    @Param('jobId') jobId: string,
    @Param('entryId') entryId: string,
    @Body() dto: ApproveMaterialDto,
  ): Promise<MaterialSummary> {
    return this.materialsService.approve(jobId, entryId, dto);
  }

  @Post(':entryId/reject')
  async reject(
    @Param('jobId') jobId: string,
    @Param('entryId') entryId: string,
    @Body() dto: RejectMaterialDto,
  ): Promise<MaterialSummary> {
    return this.materialsService.reject(jobId, entryId, dto);
  }
}
