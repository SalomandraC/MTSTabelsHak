import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserContext } from 'src/auth/user-context';
import { ExecuteToolDto } from './dto/execute-tool.dto';
import { AiToolRegistryService } from './ai-tool-registry.service';

@Controller('/api/v1/ai-tools')
export class AiToolsController {
  constructor(private readonly aiToolRegistryService: AiToolRegistryService) {}

  @Get('definitions')
  getDefinitions() {
    return {
      tools: this.aiToolRegistryService.getToolDefinitions(),
    };
  }

  @Post('execute')
  executeTool(@Body() dto: ExecuteToolDto, @CurrentUser() user: UserContext) {
    return this.aiToolRegistryService.executeTool(dto.toolName, dto.args, user, {
      pageId: dto.pageId,
      workspaceId: dto.workspaceId,
    });
  }
}