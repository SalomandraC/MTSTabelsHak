import { Controller, Get, Param } from '@nestjs/common';
import { LinksService } from './links.service';

@Controller('/api/v1/pages/:pageId')
export class LinksController {
  constructor(private readonly linksService: LinksService) {}

  @Get('backlinks')
  async getBacklinks(@Param('pageId') pageId: string) {
    return this.linksService.getBacklinks(pageId);
  }

  @Get('outgoing-links')
  async getOutgoingLinks(@Param('pageId') pageId: string) {
    return this.linksService.getOutgoingLinks(pageId);
  }
}
