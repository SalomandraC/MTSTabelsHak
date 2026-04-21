import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ObsidianAuthDto } from './obsidian-auth.dto';

export const OBSIDIAN_CONFLICT_RESOLUTIONS = ['skip', 'replace', 'create_copy'] as const;
export type ObsidianConflictResolution = (typeof OBSIDIAN_CONFLICT_RESOLUTIONS)[number];

export class ObsidianImportFileDto {
  @IsString()
  @IsNotEmpty()
  path!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsString()
  markdown!: string;

  @IsOptional()
  size?: number;

  @IsOptional()
  ctime?: number;

  @IsOptional()
  mtime?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ObsidianImportAttachmentDto)
  attachments?: ObsidianImportAttachmentDto[];
}

export class ObsidianImportAttachmentDto {
  @IsString()
  @IsNotEmpty()
  path!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsString()
  @IsNotEmpty()
  dataUrl!: string;
}

export class ObsidianImportPreviewDto extends ObsidianAuthDto {
  @IsString()
  @IsNotEmpty()
  spaceId!: string;

  @IsOptional()
  @IsString()
  mode?: string;

  @IsOptional()
  @IsIn(['preserve', 'flat'])
  folderStrategy?: 'preserve' | 'flat';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ObsidianImportFileDto)
  files!: ObsidianImportFileDto[];
}

export class ObsidianImportRunDto extends ObsidianImportPreviewDto {
  @IsOptional()
  @IsIn(OBSIDIAN_CONFLICT_RESOLUTIONS)
  defaultConflictResolution?: ObsidianConflictResolution;

  @IsOptional()
  @IsObject()
  conflictResolutions?: Record<string, ObsidianConflictResolution>;
}
