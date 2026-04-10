import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateMwsDatasheetDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  folderId?: string;

  @IsOptional()
  @IsArray()
  fields?: Record<string, unknown>[];
}

export class CreateMwsFieldDto {
  @IsString()
  name!: string;

  @IsString()
  type!: string;

  @IsOptional()
  @IsObject()
  property?: Record<string, unknown>;
}

export class CreateMwsViewDto {
  @IsString()
  name!: string;

  @IsObject()
  properties!: Record<string, unknown>;
}

export class CreateMwsRecordsDto {
  @IsString()
  fieldKey!: 'id' | 'name';

  @IsArray()
  records!: Array<{ fields: Record<string, unknown> }>;
}

export class UpdateMwsRecordsDto {
  @IsString()
  fieldKey!: 'id' | 'name';

  @IsArray()
  records!: Array<{ recordId: string; fields: Record<string, unknown> }>;
}

export class ResolveTableEmbedDto {
  @IsString()
  spaceId!: string;

  @IsString()
  nodeId!: string;

  @IsString()
  datasheetId!: string;

  @IsOptional()
  @IsString()
  viewId?: string;

  @IsOptional()
  @IsArray()
  selectedFieldIds?: string[];

  @IsOptional()
  @IsString()
  displayMode?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  pageSize?: number;

  @IsOptional()
  @IsString()
  filterByFormula?: string;

  @IsOptional()
  @IsBoolean()
  allowInlineEdit?: boolean;
}
