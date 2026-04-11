import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserContext } from 'src/auth/user-context';
import { CommentsService } from './comments.service';
import { CreateCommentMessageDto } from './dto/create-comment-message.dto';
import { CreateCommentThreadDto } from './dto/create-comment-thread.dto';
import { UpdateCommentMessageDto } from './dto/update-comment-message.dto';
import { UpdateCommentThreadDto } from './dto/update-comment-thread.dto';

@Controller('/api/v1/pages/:pageId/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  async listThreads(
    @Param('pageId') pageId: string,
    @Query('includeResolved') includeResolved = 'true',
  ) {
    return this.commentsService.listThreads(pageId, includeResolved !== 'false');
  }

  @Post('threads')
  async createThread(
    @Param('pageId') pageId: string,
    @Body() dto: CreateCommentThreadDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.commentsService.createThread(pageId, dto, user);
  }

  @Patch('threads/:threadId')
  async updateThread(
    @Param('pageId') pageId: string,
    @Param('threadId') threadId: string,
    @Body() dto: UpdateCommentThreadDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.commentsService.updateThread(pageId, threadId, dto, user);
  }

  @Post('threads/:threadId/messages')
  async addMessage(
    @Param('pageId') pageId: string,
    @Param('threadId') threadId: string,
    @Body() dto: CreateCommentMessageDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.commentsService.addMessage(pageId, threadId, dto, user);
  }

  @Patch('threads/:threadId/messages/:messageId')
  async updateMessage(
    @Param('pageId') pageId: string,
    @Param('threadId') threadId: string,
    @Param('messageId') messageId: string,
    @Body() dto: UpdateCommentMessageDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.commentsService.updateMessage(pageId, threadId, messageId, dto, user);
  }

  @Delete('threads/:threadId/messages/:messageId')
  async deleteMessage(
    @Param('pageId') pageId: string,
    @Param('threadId') threadId: string,
    @Param('messageId') messageId: string,
    @CurrentUser() user: UserContext,
  ) {
    return this.commentsService.deleteMessage(pageId, threadId, messageId, user);
  }
}
