import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePublicLeadDto {
  @IsString()
  tenant!: string;

  @IsString()
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  propertyLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  propertyLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  propertyCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  propertyState?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  propertyPostalCode?: string;
}
