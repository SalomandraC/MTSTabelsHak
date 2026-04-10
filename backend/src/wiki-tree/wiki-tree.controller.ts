import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserContext } from 'src/auth/user-context';
import { CreateFolderDto } from './dto/create-folder.dto';
import { MoveNodeDto } from './dto/move-node.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';
import { WikiTreeService } from './wiki-tree.service';

@Controller('/api/v1')
export class WikiTreeController {
  constructor(private readonly wikiTreeService: WikiTreeService) {}

  @Get('/spaces/:spaceId/wiki/tree')
  async getTree(@Param('spaceId') spaceId: string) {
    return {
      items: await this.wikiTreeService.getTree(spaceId),
    };
  }

  @Post('/folders')
  async createFolder(@Body() dto: CreateFolderDto, @CurrentUser() user: UserContext) {
    return {
      folder: await this.wikiTreeService.createFolder(dto, user),
    };
  }

  @Patch('/folders/:folderId')
  async updateFolder(
    @Param('folderId') folderId: string,
    @Body() dto: UpdateFolderDto,
    @CurrentUser() user: UserContext,
  ) {
    return {
      folder: await this.wikiTreeService.updateFolder(folderId, dto, user),
    };
  }

  @Delete('/folders/:folderId')
  async deleteFolder(@Param('folderId') folderId: string, @CurrentUser() user: UserContext) {
    await this.wikiTreeService.deleteFolder(folderId, user);
  }

  @Post('/nodes/:nodeId/move')
  async moveNode(
    @Param('nodeId') nodeId: string,
    @Body() dto: MoveNodeDto,
    @CurrentUser() user: UserContext,
  ) {
    return {
      node: await this.wikiTreeService.moveNode(nodeId, dto, user),
    };
  }
}
