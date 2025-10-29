import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { TenantGuard } from '../../tenancy/tenant.guard';
import {
  TimeEntriesService,
  TimeEntrySummary,
} from './time-entries.service';
import { ListTimeEntriesDto } from './dto/list-time-entries.dto';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';

@Controller('jobs/:jobId/time-entries')
@UseGuards(TenantGuard)
export class TimeEntriesController {
  constructor(private readonly timeEntriesService: TimeEntriesService) {}

  @Get()
  async list(
    @Param('jobId') jobId: string,
    @Query() query: ListTimeEntriesDto,
  ): Promise<TimeEntrySummary[]> {
    return this.timeEntriesService.listForJob(jobId, query);
  }

  @Post('clock-in')
  async clockIn(
    @Param('jobId') jobId: string,
    @Body() dto: ClockInDto,
  ): Promise<TimeEntrySummary> {
    return this.timeEntriesService.clockIn(jobId, dto);
  }

  @Post(':entryId/clock-out')
  async clockOut(
    @Param('jobId') jobId: string,
    @Param('entryId') entryId: string,
    @Body() dto: ClockOutDto,
  ): Promise<TimeEntrySummary> {
    return this.timeEntriesService.clockOut(jobId, entryId, dto);
  }
}
