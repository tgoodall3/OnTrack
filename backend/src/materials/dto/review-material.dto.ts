import { IsOptional, IsString } from 'class-validator';

export class ApproveMaterialDto {
  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  approverId?: string;
}

export class RejectMaterialDto {
  @IsString()
  reason!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  approverId?: string;
}
