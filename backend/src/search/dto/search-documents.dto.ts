import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SearchDocumentsDto {
  @IsString()
  spaceId!: string;

  @IsString()
  query!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  pageIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  folderIds?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  topK?: number;
}
