import { IsOptional, IsString } from 'class-validator';

export class ListTimeEntriesDto {
  @IsOptional()
  @IsString()
  userId?: string;
}
