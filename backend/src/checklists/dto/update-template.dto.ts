import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class UpdateChecklistItemInput {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  title!: string;
}

export class UpdateChecklistTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateChecklistItemInput)
  items!: UpdateChecklistItemInput[];
}
