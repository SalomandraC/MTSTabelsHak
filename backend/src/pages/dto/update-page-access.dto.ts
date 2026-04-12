import { DocumentAccessScope } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdatePageAccessDto {
  @IsEnum(DocumentAccessScope)
  viewAccess!: DocumentAccessScope;

  @IsEnum(DocumentAccessScope)
  commentAccess!: DocumentAccessScope;

  @IsEnum(DocumentAccessScope)
  editAccess!: DocumentAccessScope;
}
