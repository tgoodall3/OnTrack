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
import { TasksService, TaskSummary } from './tasks.service';
import { ListTasksDto } from './dto/list-tasks.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TenantGuard } from '../tenancy/tenant.guard';

@Controller('jobs/:jobId/tasks')
@UseGuards(TenantGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  async list(
    @Param('jobId') jobId: string,
    @Query() query: ListTasksDto,
  ): Promise<TaskSummary[]> {
    return this.tasksService.list(jobId, query);
  }

  @Post()
  async create(
    @Param('jobId') jobId: string,
    @Body() dto: CreateTaskDto,
  ): Promise<TaskSummary> {
    return this.tasksService.create(jobId, dto);
  }

  @Patch(':taskId')
  async update(
    @Param('jobId') jobId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
  ): Promise<TaskSummary> {
    return this.tasksService.update(jobId, taskId, dto);
  }

  @Delete(':taskId')
  async remove(
    @Param('jobId') jobId: string,
    @Param('taskId') taskId: string,
  ): Promise<void> {
    await this.tasksService.remove(jobId, taskId);
  }
}
