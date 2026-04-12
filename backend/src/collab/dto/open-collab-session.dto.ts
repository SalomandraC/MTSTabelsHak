import { IsBoolean, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ClientDto {
  @IsString()
  clientId!: string;

  @IsString()
  deviceId!: string;

  @IsString()
  editorVersion!: string;
}

export class OpenCollabSessionDto {
  @ValidateNested()
  @Type(() => ClientDto)
  client!: ClientDto;

  @IsOptional()
  @IsUUID()
  lastCheckpointId?: string;

  @IsOptional()
  knownServerVersion?: number;

  @IsOptional()
  @IsBoolean()
  localDraftAvailable?: boolean;
}
