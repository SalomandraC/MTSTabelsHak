import { Controller, Get, Param, Query } from '@nestjs/common';
import { HistoryService } from './history.service';

@Controller('/api/v1/pages/:pageId')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get('history')
  async listHistory(
    @Param('pageId') pageId: string,
    @Query('limit') limit?: string,
  ) {
    return this.historyService.listHistory(pageId, limit ? Number(limit) : 50);
  }

  @Get('history/:checkpointId')
  async getCheckpoint(
    @Param('pageId') pageId: string,
    @Param('checkpointId') checkpointId: string,
  ) {
    return this.historyService.getCheckpoint(pageId, checkpointId);
  }
}
