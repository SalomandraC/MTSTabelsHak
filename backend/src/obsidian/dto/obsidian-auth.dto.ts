import { IsNotEmpty, IsString } from 'class-validator';

export class ObsidianAuthDto {
  @IsString()
  @IsNotEmpty()
  apiKey!: string;
}
