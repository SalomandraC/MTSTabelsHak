import { IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, ValidateIf } from 'class-validator';

type SnapshotPayload = Record<string, unknown> | string;

export class CompletionRequestDto {
  @IsString()
  currentText!: string;

  @IsOptional()
  @IsIn(['paragraph', 'heading', 'listItem', 'tableCell', 'formula', 'liveReference'])
  completionMode?: 'paragraph' | 'heading' | 'listItem' | 'tableCell' | 'formula' | 'liveReference';

  @IsOptional()
  @IsString()
  cursorContext?: string;

  @IsOptional()
  @IsString()
  pageTitle?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== undefined && typeof value !== 'string')
  @IsObject()
  @ValidateIf((_, value) => typeof value === 'string')
  @IsString()
  pageSnapshot?: SnapshotPayload;

  @IsOptional()
  @IsBoolean()
  stream?: boolean;
}

export class GenerateRequestDto {
  @IsString()
  prompt!: string;

  @IsOptional()
  @IsString()
  pageTitle?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== undefined && typeof value !== 'string')
  @IsObject()
  @ValidateIf((_, value) => typeof value === 'string')
  @IsString()
  pageSnapshot?: SnapshotPayload;
}

export class TransformRequestDto {
  @IsString()
  text!: string;

  @IsIn(['professional', 'shorten', 'expand', 'fix_grammar'])
  transformation!: 'professional' | 'shorten' | 'expand' | 'fix_grammar';

  @IsOptional()
  @IsIn(['technical', 'executive_summary', 'action_plan', 'legal_formal', 'fix_grammar'])
  styleId?: 'technical' | 'executive_summary' | 'action_plan' | 'legal_formal' | 'fix_grammar';

  @IsOptional()
  @IsString()
  pageTitle?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== undefined && typeof value !== 'string')
  @IsObject()
  @ValidateIf((_, value) => typeof value === 'string')
  @IsString()
  pageSnapshot?: SnapshotPayload;
}

export class ChatRequestDto {
  @IsString()
  question!: string;

  @IsOptional()
  @IsIn(['chat', 'plan_mutation', 'write_report', 'autocomplete', 'analyze'])
  intent?: 'chat' | 'plan_mutation' | 'write_report' | 'autocomplete' | 'analyze';

  @IsOptional()
  @IsString()
  spaceId?: string;

  @IsOptional()
  @IsString()
  contextScope?: string;

  @IsOptional()
  @IsString()
  pageId?: string;

  @IsOptional()
  @IsString()
  datasheetId?: string;

  @IsOptional()
  @IsString()
  viewId?: string;

  @IsOptional()
  @IsString()
  pageTitle?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== undefined && typeof value !== 'string')
  @IsObject()
  @ValidateIf((_, value) => typeof value === 'string')
  @IsString()
  pageSnapshot?: SnapshotPayload;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedPageIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedFolderIds?: string[];

  @IsOptional()
  @IsArray()
  contextDocuments?: Array<{
    pageId: string;
    title: string;
    markdown: string;
  }>;

  @IsOptional()
  @IsObject()
  workspaceStructure?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  useVectorSearch?: boolean;
}
