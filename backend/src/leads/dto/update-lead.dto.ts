import { IsEnum, IsOptional, IsString } from 'class-validator';
import { LeadStage } from '@prisma/client';

export class UpdateLeadDto {
  @IsOptional()
  @IsEnum(LeadStage)
  stage?: LeadStage;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsString()
  propertyId?: string | null;
}
