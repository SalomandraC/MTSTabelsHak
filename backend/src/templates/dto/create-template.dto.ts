import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export const TEMPLATE_ACCESS_LEVELS = ['private', 'space', 'public'] as const;
export type TemplateAccessLevelDto = (typeof TEMPLATE_ACCESS_LEVELS)[number];

export class CreateTemplateDto {
  @IsString()
  spaceId!: string;

  @IsString()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  icon?: string;

  @IsIn(TEMPLATE_ACCESS_LEVELS)
  accessLevel!: TemplateAccessLevelDto;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  pageTitleTemplate?: string;

  @IsObject()
  document!: Record<string, unknown>;
}