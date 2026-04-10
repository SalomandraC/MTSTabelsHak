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
import { CreatePageDto } from './dto/create-page.dto';
import { UpdatePageDto } from './dto/update-page.dto';
import { PagesService } from './pages.service';

@Controller('/api/v1/pages')
export class PagesController {
  constructor(private readonly pagesService: PagesService) {}

  @Get()
  async listPages(
    @Query('spaceId') spaceId: string,
    @Query('query') query?: string,
    @Query('limit') limit = '20',
  ) {
    return this.pagesService.listPages(spaceId, query, Number(limit));
  }

  @Post()
  async createPage(@Body() dto: CreatePageDto, @CurrentUser() user: UserContext) {
    return this.pagesService.createPage(dto, user);
  }

  @Get(':pageId')
  async getPage(
    @Param('pageId') pageId: string,
    @Query('includeDocumentState') includeDocumentState = 'true',
  ) {
    return this.pagesService.getPage(pageId, includeDocumentState !== 'false');
  }

  @Patch(':pageId')
  async updatePage(
    @Param('pageId') pageId: string,
    @Body() dto: UpdatePageDto,
    @CurrentUser() user: UserContext,
  ) {
    return this.pagesService.updatePage(pageId, dto, user);
  }

  @Delete(':pageId')
  async deletePage(@Param('pageId') pageId: string, @CurrentUser() user: UserContext) {
    await this.pagesService.deletePage(pageId, user);
  }
}
