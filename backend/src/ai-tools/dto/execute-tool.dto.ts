import { IsObject, IsOptional, IsString } from 'class-validator';

export class ExecuteToolDto {
  @IsString()
  toolName!: string;

  @IsObject()
  args!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  pageId?: string;

  @IsOptional()
  @IsString()
  workspaceId?: string;
}