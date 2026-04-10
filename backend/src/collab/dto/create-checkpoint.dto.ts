import { IsEnum, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum CheckpointTriggerDto {
  EDITOR_IDLE = 'editor-idle',
  BEFORE_UNLOAD = 'before-unload',
  MANUAL = 'manual',
  RECONNECT = 'reconnect',
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

  @ValidateNested()
  @Type(() => DocumentStateDto)
  documentState!: DocumentStateDto;
}
