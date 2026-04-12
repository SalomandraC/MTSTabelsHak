import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateDisplayNameDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  displayName!: string;
}
