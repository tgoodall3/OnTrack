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
import { JobsService, JobSummary } from './jobs.service';
import { ListJobsDto } from './dto/list-jobs.dto';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { TenantGuard } from '../tenancy/tenant.guard';

@Controller('jobs')
@UseGuards(TenantGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  async list(@Query() query: ListJobsDto): Promise<JobSummary[]> {
    return this.jobsService.list(query);
  }

  @Get(':id')
  async detail(@Param('id') id: string): Promise<JobSummary> {
    return this.jobsService.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateJobDto): Promise<JobSummary> {
    return this.jobsService.create(dto);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateJobDto,
  ): Promise<JobSummary> {
    return this.jobsService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    await this.jobsService.remove(id);
  }
}
