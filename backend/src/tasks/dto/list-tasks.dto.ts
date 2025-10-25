import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TaskStatus } from '@prisma/client';

export class ListTasksDto {
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsString()
  assigneeId?: string;
}
