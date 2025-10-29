import { IsDateString, IsObject, IsOptional, IsString } from 'class-validator';

export class ClockInDto {
  @IsOptional()
  @IsDateString()
  clockIn?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  gps?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  userId?: string;
}
