import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class PlanTableMutationDto {
  @IsIn(['create_records', 'add_table_column'])
  operation!: 'create_records' | 'add_table_column';

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
