import { IsOptional, IsString, IsUUID } from 'class-validator';

export class MoveNodeDto {
  @IsOptional()
  @IsUUID()
  targetParentId?: string | null;

  @IsOptional()
  @IsString()
  targetExternalParentNodeId?: string | null;
}
