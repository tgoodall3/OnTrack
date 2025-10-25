import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import { JobStatus } from '@prisma/client';

export class CreateJobDto {
  @ValidateIf((dto) => !dto.estimateId)
  @IsString()
  leadId?: string;

  @IsOptional()
  @IsString()
  estimateId?: string;

  @IsOptional()
  @IsString()
  propertyId?: string;

  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;

  @IsOptional()
  @IsDateString()
  scheduledStart?: string;

  @IsOptional()
  @IsDateString()
  scheduledEnd?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
