import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserContext } from 'src/auth/user-context';
import { AiChatService } from './ai-chat.service';

@Controller('/api/v1/ai-tools')
export class AiSmokeTestController {
  constructor(private readonly aiChatService: AiChatService) {}

  @Get('smoke-test')
  async smokeTest(@CurrentUser() user: UserContext) {
    try {
      const result = await this.aiChatService.askQuestion(
        {
          question:
            'Привет! Посмотри в таблице dstf2fJvxaGwEoKbMU, какие записи там есть, и кратко опиши их одним предложением',
          datasheetId: 'dstf2fJvxaGwEoKbMU',
          viewId: 'viwqsvV5QzMvA',
        },
        user,
      );

      return {
        full_ai_response: result.answer,
        debug_steps: result.usedTools.map((step) => ({
          tool_name: step.toolName,
          args: step.args,
        })),
        status: 'success',
      };
    } catch (error: any) {
      return {
        full_ai_response: null,
        debug_steps: [],
        status: error?.response?.data ?? error?.message ?? 'unknown_error',
      };
    }
  }
}