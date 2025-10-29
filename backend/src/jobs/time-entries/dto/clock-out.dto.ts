import { IsDateString, IsObject, IsOptional, IsString } from 'class-validator';

export class ClockOutDto {
  @IsOptional()
  @IsDateString()
  clockOut?: string;

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
