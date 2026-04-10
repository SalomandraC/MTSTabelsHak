import { IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class InitialContentDto {
  @IsString()
  encoding!: string;

  @IsString()
  value!: string;
}

export class CreatePageDto {
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

  @IsOptional()
  @ValidateNested()
  @Type(() => InitialContentDto)
  initialContent?: InitialContentDto;
}
