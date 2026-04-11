import { IsIn } from 'class-validator';

export class UpdateCommentThreadDto {
  @IsIn(['open', 'resolved'])
  status!: 'open' | 'resolved';
}
