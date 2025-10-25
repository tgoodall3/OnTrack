import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { JobStatus } from '@prisma/client';

export class UpdateJobDto {
  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;

  @IsOptional()
  @IsDateString()
  scheduledStart?: string | null;

  @IsOptional()
  @IsDateString()
  scheduledEnd?: string | null;

  @IsOptional()
  @IsDateString()
  actualStart?: string | null;

  @IsOptional()
  @IsDateString()
  actualEnd?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
