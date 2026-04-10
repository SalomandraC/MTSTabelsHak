import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePageDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}
