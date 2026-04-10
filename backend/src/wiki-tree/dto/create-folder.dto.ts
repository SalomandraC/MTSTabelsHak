import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateFolderDto {
  @IsString()
  spaceId!: string;

  @IsOptional()
  @IsUUID()
  parentNodeId?: string;

  @IsString()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  icon?: string;
}
