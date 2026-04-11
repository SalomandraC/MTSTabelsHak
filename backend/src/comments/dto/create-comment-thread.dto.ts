import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateCommentThreadDto {
  @IsUUID()
  threadId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  anchorText!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}
