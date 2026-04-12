import { IsObject, IsOptional, IsString } from 'class-validator';

export class PlanTableWorkflowDto {
  @IsString()
  prompt!: string;

  @IsString()
  spaceId!: string;

  @IsString()
  datasheetId!: string;

  @IsOptional()
  @IsString()
  viewId?: string;

  @IsOptional()
  @IsObject()
  tableSnapshot?: {
    datasheetId?: string;
    viewId?: string | null;
    fields?: Array<Record<string, unknown>>;
    records?: Array<Record<string, unknown>>;
    total?: number;
    updatedAt?: number;
  };
}