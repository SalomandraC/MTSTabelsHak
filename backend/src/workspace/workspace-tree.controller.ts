import { Controller, Get, Param } from '@nestjs/common';
import { UserContext } from 'src/auth/user-context';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { WorkspaceTreeService } from './workspace-tree.service';

@Controller('/api/v1/spaces')
export class WorkspaceTreeController {
  constructor(private readonly workspaceTreeService: WorkspaceTreeService) {}

  @Get(':spaceId/workspace/tree')
  async getWorkspaceTree(@Param('spaceId') spaceId: string, @CurrentUser() user: UserContext) {
    return this.workspaceTreeService.getTree(spaceId, user);
  }
}
