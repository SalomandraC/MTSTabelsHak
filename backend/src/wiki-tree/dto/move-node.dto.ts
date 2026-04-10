import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class MoveNodeDto {
  @IsOptional()
  @IsUUID()
  targetParentId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
