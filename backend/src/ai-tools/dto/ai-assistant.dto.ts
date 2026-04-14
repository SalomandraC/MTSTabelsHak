import { IsBoolean, IsObject, IsOptional, IsString, IsIn } from 'class-validator';

export class CompletionRequestDto {
  @IsString()
  currentText!: string;

  @IsOptional()
  @IsString()
  pageTitle?: string;

  @IsOptional()
  @IsObject()
  pageSnapshot?: Record<string, unknown>;

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
  @IsObject()
  pageSnapshot?: Record<string, unknown>;
}

export class TransformRequestDto {
  @IsString()
  text!: string;

  @IsIn(['professional', 'shorten', 'expand', 'fix_grammar'])
  transformation!: 'professional' | 'shorten' | 'expand' | 'fix_grammar';

  @IsOptional()
  @IsIn(['standard', 'business', 'military', 'medieval', 'church', 'fix', 'expand'])
  styleId?: 'standard' | 'business' | 'military' | 'medieval' | 'church' | 'fix' | 'expand';

  @IsOptional()
  @IsString()
  pageTitle?: string;

  @IsOptional()
  @IsObject()
  pageSnapshot?: Record<string, unknown>;
}

export class ChatRequestDto {
  @IsString()
  question!: string;

  @IsOptional()
  @IsIn(['chat', 'plan_mutation', 'write_report', 'autocomplete'])
  intent?: 'chat' | 'plan_mutation' | 'write_report' | 'autocomplete';

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
  @IsObject()
  pageSnapshot?: Record<string, unknown>;
}