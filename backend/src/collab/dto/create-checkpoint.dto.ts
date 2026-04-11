import { IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum CheckpointTriggerDto {
  EDITOR_IDLE = 'editor-idle',
  BEFORE_UNLOAD = 'before-unload',
  MANUAL = 'manual',
  RECONNECT = 'reconnect',
  RESTORE = 'restore',
}

class DocumentStateDto {
  @IsString()
  encoding!: string;

  @IsString()
  value!: string;
}

export class CreateCheckpointDto {
  @IsEnum(CheckpointTriggerDto)
  trigger!: CheckpointTriggerDto;

  @IsOptional()
  @IsString()
  restoredFromCheckpointId?: string;

  @ValidateNested()
  @Type(() => DocumentStateDto)
  documentState!: DocumentStateDto;
}
