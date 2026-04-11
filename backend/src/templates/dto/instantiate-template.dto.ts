import { IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class InstantiateTemplateDto {
  @IsString()
  spaceId!: string;

  @IsOptional()
  @IsUUID()
  parentNodeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsObject()
  values!: Record<string, string>;
}
