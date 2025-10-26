import { IsEmail, IsOptional, IsString } from 'class-validator';

export class SendEstimateDto {
  @IsEmail()
  recipientEmail!: string;

  @IsOptional()
  @IsString()
  recipientName?: string;

  @IsOptional()
  @IsString()
  message?: string;
}
