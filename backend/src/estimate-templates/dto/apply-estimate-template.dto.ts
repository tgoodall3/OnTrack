import { IsString } from 'class-validator';

export class ApplyEstimateTemplateDto {
  @IsString()
  estimateId!: string;
}
