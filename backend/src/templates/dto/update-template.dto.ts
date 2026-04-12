import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

import { TEMPLATE_ACCESS_LEVELS, type TemplateAccessLevelDto } from './create-template.dto';

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  icon?: string;

  @IsOptional()
  @IsIn(TEMPLATE_ACCESS_LEVELS)
  accessLevel?: TemplateAccessLevelDto;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  pageTitleTemplate?: string;

  @IsOptional()
  @IsObject()
  document?: Record<string, unknown>;
}
