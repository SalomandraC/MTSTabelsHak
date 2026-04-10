import { Body, Controller, Param, Post } from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserContext } from 'src/auth/user-context';
import { CollabService } from './collab.service';
import { CreateCheckpointDto } from './dto/create-checkpoint.dto';
import { OpenCollabSessionDto } from './dto/open-collab-session.dto';

@Controller('/api/v1/pages/:pageId')
export class CollabController {
  constructor(private readonly collabService: CollabService) {}

  @Post('collab/session')
  async openSession(
    @Param('pageId') pageId: string,
    @Body() dto: OpenCollabSessionDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.collabService.openSession(pageId, dto, user);
  }

  @Post('checkpoints')
  async createCheckpoint(
    @Param('pageId') pageId: string,
    @Body() dto: CreateCheckpointDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.collabService.createCheckpoint(pageId, dto, user);
  }
}
