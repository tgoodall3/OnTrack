import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { LeadStage } from '@prisma/client';

class CreateLeadContactDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

class CreateLeadPropertyAddressDto {
  @IsString()
  line1!: string;

  @IsOptional()
  @IsString()
  line2?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;
}

export class CreateLeadDto {
  @ValidateIf((dto) => !dto.contact)
  @IsString()
  contactId?: string;

  @ValidateIf((dto) => !dto.contactId)
  @ValidateNested()
  @Type(() => CreateLeadContactDto)
  contact?: CreateLeadContactDto;

  @IsOptional()
  @IsString()
  propertyId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateLeadPropertyAddressDto)
  propertyAddress?: CreateLeadPropertyAddressDto;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsEnum(LeadStage)
  stage?: LeadStage;

  @IsOptional()
  @IsString()
  notes?: string;
}

export type CreateLeadRequest = CreateLeadDto;
