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
import {
  CrewScheduleEntry,
  JobActivityEntry,
  JobsService,
  JobSummary,
} from './jobs.service';
import { ListJobsDto } from './dto/list-jobs.dto';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { TenantGuard } from '../tenancy/tenant.guard';
import { CrewScheduleDto } from './dto/crew-schedule.dto';
import { RequestContextService } from '../context/request-context.service';

@Controller('jobs')
@UseGuards(TenantGuard)
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly requestContext: RequestContextService,
  ) {}

  @Get()
  async list(@Query() query: ListJobsDto): Promise<JobSummary[]> {
    return this.jobsService.list(query);
  }

  @Get('crew/schedule')
  async crewSchedule(
    @Query() query: CrewScheduleDto,
  ): Promise<CrewScheduleEntry[]> {
    return this.jobsService.crewSchedule(
      query,
      this.requestContext.context.userId,
    );
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

  @Get(':id/activity')
  async activity(@Param('id') id: string): Promise<JobActivityEntry[]> {
    return this.jobsService.activity(id);
  }
}
