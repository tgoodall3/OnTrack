import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsObject, Min, MaxLength } from 'class-validator';

export class CreateMaterialDto {
  @IsString()
  sku!: string;

  @IsOptional()
  @IsString()
  costCode?: string;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0.01)
  quantity!: number;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  unitCost!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  recordedById?: string;
}
