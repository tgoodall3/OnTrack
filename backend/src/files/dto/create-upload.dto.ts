import {
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateUploadDto {
  @IsString()
  fileName!: string;

  @IsString()
  mimeType!: string;

  @IsInt()
  @Min(1)
  fileSize!: number;

  @IsOptional()
  @ValidateIf((dto) => !dto.estimateId && !dto.invoiceId)
  @IsString()
  jobId?: string;

  @IsOptional()
  @ValidateIf((dto) => !dto.jobId && !dto.invoiceId)
  @IsString()
  estimateId?: string;

  @IsOptional()
  @ValidateIf((dto) => !dto.jobId && !dto.estimateId)
  @IsString()
  invoiceId?: string;
}
