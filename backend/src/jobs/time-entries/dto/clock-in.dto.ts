import { Type } from 'class-transformer';
import { IsDateString, IsOptional, IsString, ValidateNested } from 'class-validator';
import { LocationSampleDto } from './location-sample.dto';

export class ClockInDto {
  @IsOptional()
  @IsDateString()
  clockIn?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LocationSampleDto)
  location?: LocationSampleDto;

  @IsOptional()
  @IsString()
  userId?: string;
}
