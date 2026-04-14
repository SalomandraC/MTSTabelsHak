import { Controller, Get, Param, Query } from '@nestjs/common';
import { UserContext } from 'src/auth/user-context';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { HistoryService } from './history.service';

@Controller('/api/v1/pages/:pageId')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get('history')
  async listHistory(
    @Param('pageId') pageId: string,
    @CurrentUser() user: UserContext,
    @Query('limit') limit?: string,
  ) {
    return this.historyService.listHistory(pageId, user, limit ? Number(limit) : 50);
  }

  @Get('history/:checkpointId')
  async getCheckpoint(
    @Param('pageId') pageId: string,
    @Param('checkpointId') checkpointId: string,
    @CurrentUser() user: UserContext,
  ) {
    return this.historyService.getCheckpoint(pageId, checkpointId, user);
  }
}
