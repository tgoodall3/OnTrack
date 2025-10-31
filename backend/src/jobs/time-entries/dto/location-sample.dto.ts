import { IsDateString, IsNumber, IsOptional } from 'class-validator';

export class LocationSampleDto {
  @IsNumber({ allowInfinity: false, allowNaN: false })
  lat!: number;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  lng!: number;

  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  accuracy?: number;

  @IsOptional()
  @IsDateString()
  capturedAt?: string;
}
