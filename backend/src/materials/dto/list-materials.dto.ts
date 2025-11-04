import { MaterialApprovalStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ListMaterialsDto {
  @IsOptional()
  @IsEnum(MaterialApprovalStatus)
  status?: MaterialApprovalStatus;

  @IsOptional()
  @IsString()
  search?: string;
}
