import { Transform } from 'class-transformer';
import { IsOptional, IsBoolean } from 'class-validator';

export class ListTemplatesDto {
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return undefined;
  })
  archived?: boolean;
}
