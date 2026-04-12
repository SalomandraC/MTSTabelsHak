import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { UserContext } from 'src/auth/user-context';
import { ExecuteToolDto } from './dto/execute-tool.dto';
import { PlanTableMutationDto } from './dto/plan-table-mutation.dto';
import {
  ChatRequestDto,
  CompletionRequestDto,
  GenerateRequestDto,
  TransformRequestDto,
} from './dto/ai-assistant.dto';
import { AiToolRegistryService } from './ai-tool-registry.service';
import { AiAssistantService } from './ai-assistant.service';
import { AiChatService } from './ai-chat.service';

@Controller('/api/v1/ai')
export class AiToolsController {
  constructor(
    private readonly aiToolRegistryService: AiToolRegistryService,
    private readonly aiAssistantService: AiAssistantService,
    private readonly aiChatService: AiChatService,
  ) {}

  @Get('definitions')
  @Public()
  getDefinitions() {
    return {
      tools: this.aiToolRegistryService.getToolDefinitions(),
    };
  }

  @Post('autocomplete')
  @Public()
  autocomplete(@Body() dto: CompletionRequestDto) {
    return this.aiAssistantService.getCompletion(dto.currentText, {
      pageTitle: dto.pageTitle,
      pageSnapshot: dto.pageSnapshot,
    });
  }

  @Post('generate')
  @Public()
  generate(@Body() dto: GenerateRequestDto) {
    return this.aiAssistantService.generateContent(dto.prompt, {
      pageTitle: dto.pageTitle,
      pageSnapshot: dto.pageSnapshot,
    });
  }

  @Post('transform')
  @Public()
  transform(@Body() dto: TransformRequestDto) {
    return this.aiAssistantService.transformText(dto.text, dto.transformation, {
      pageTitle: dto.pageTitle,
      pageSnapshot: dto.pageSnapshot,
    });
  }

  @Post('chat')
  @Public()
  chat(@Body() dto: ChatRequestDto, @CurrentUser() user: UserContext) {
    return this.aiChatService.askQuestion(
      {
        question: dto.question,
        pageId: dto.pageId,
        datasheetId: dto.datasheetId,
        viewId: dto.viewId,
        pageTitle: dto.pageTitle,
        pageSnapshot: dto.pageSnapshot,
      },
      user,
    );
  }

  @Post('execute')
  @Public()
  executeTool(@Body() dto: ExecuteToolDto, @CurrentUser() user: UserContext) {
    return this.aiToolRegistryService.executeTool(dto.toolName, dto.args, user, {
      pageId: dto.pageId,
      workspaceId: dto.workspaceId,
    });
  }

  @Post('plan-mutation')
  @Public()
  planTableMutation(@Body() dto: PlanTableMutationDto) {
    return this.aiAssistantService.planTableMutation({
      operation: dto.operation,
      prompt: dto.prompt,
      spaceId: dto.spaceId,
      datasheetId: dto.datasheetId,
      viewId: dto.viewId,
      tableSnapshot: dto.tableSnapshot,
    });
  }
}