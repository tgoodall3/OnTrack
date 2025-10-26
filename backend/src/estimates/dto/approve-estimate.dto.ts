import { IsEmail, IsOptional, IsString } from 'class-validator';

export class ApproveEstimateDto {
  @IsString()
  approverName!: string;

  @IsOptional()
  @IsEmail()
  approverEmail?: string;

  @IsOptional()
  @IsString()
  signature?: string;
}
