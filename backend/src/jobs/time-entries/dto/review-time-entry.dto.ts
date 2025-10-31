import { IsOptional, IsString } from 'class-validator';

export class ApproveTimeEntryDto {
  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  approverId?: string;
}

export class RejectTimeEntryDto {
  @IsString()
  reason!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  approverId?: string;
}
