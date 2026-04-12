import { BadRequestException, Injectable } from '@nestjs/common';
import { UserContext } from 'src/auth/user-context';
import { AiProviderClientService, AiChatMessage } from './ai-provider-client.service';
import { ChatQuestionInput, ChatQuestionResponse } from './ai-chat.types';
import { AiToolRegistryService } from './ai-tool-registry.service';
import { ToolExecutionResult } from './ai-tool-registry.types';

@Injectable()
export class AiChatService {
  private readonly mutationToolNames = new Set(['create_records', 'patch_records', 'add_table_column']);

  constructor(
    private readonly aiProviderClientService: AiProviderClientService,
    private readonly aiToolRegistryService: AiToolRegistryService,
  ) {}

  async askQuestion(input: ChatQuestionInput, user: UserContext): Promise<ChatQuestionResponse> {
    const contextMarkdown = this.snapshotToMarkdown(input.pageSnapshot);
    const messages = this.buildMessages(input.question, contextMarkdown, input);

    const toolDefinitions = this.aiToolRegistryService
      .getToolDefinitions()
      .filter((definition) => ['create_records', 'patch_records', 'get_records', 'add_table_column'].includes(definition.function.name));
    const conversation: AiChatMessage[] = [...messages];
    const usedTools: Array<{ toolName: string; args: Record<string, unknown> }> = [];
    const references: Array<Record<string, unknown>> = [];
    let needsRefresh = false;

    let response = await this.aiProviderClientService.complete({
      messages,
      temperature: 0.25,
      maxTokens: 512,
      tools: toolDefinitions,
      toolChoice: 'auto',
    });

    for (let round = 0; round < 3; round += 1) {
      const assistantMessage = response.choices?.[0]?.message;
      const toolCalls = assistantMessage?.tool_calls ?? [];

      if (!toolCalls.length) {
        break;
      }

      console.log('AI TOOL_CALLS ROUND:', round, toolCalls.map((call) => call.function.name));

      conversation.push({
        role: 'assistant',
        content: assistantMessage?.content ?? '',
        tool_calls: toolCalls,
      });

      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        const args = this.parseToolArguments(toolCall.function.arguments);
        usedTools.push({ toolName, args });

        console.log('EXECUTE TOOL FROM CHAT:', toolName, args);

        const toolResult = await this.executeTool(toolName, args, user, {
          pageId: input.pageId,
        });

        if (toolResult.ok && this.mutationToolNames.has(toolName)) {
          needsRefresh = true;
        }

        if (toolResult.ok && toolResult.canonicalRecords?.length) {
          references.push(
            ...toolResult.canonicalRecords.map((record) => ({
              recordId: record.recordId,
              fields: record.fields,
            })),
          );
        }

        conversation.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolName,
          content: JSON.stringify(toolResult),
        });
      }

      response = await this.aiProviderClientService.complete({
        messages: conversation,
        temperature: 0.2,
        maxTokens: 512,
        tools: toolDefinitions,
        toolChoice: 'none',
      });
    }

    const answer = String(response.choices?.[0]?.message?.content ?? '').trim();

    if (!answer) {
      throw new BadRequestException({
        code: 'AI_CHAT_EMPTY',
        message: 'AI chat response is empty',
      });
    }

    return {
      answer,
      needsRefresh,
      usedTools,
      contextMarkdown,
      references,
    };
  }

  async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    user: UserContext,
    context: { pageId?: string } = {},
  ): Promise<ToolExecutionResult> {
    return this.aiToolRegistryService.executeTool(toolName, args, user, {
      pageId: context.pageId,
    });
  }

  private buildMessages(question: string, contextMarkdown: string, input: ChatQuestionInput): AiChatMessage[] {
    const tableContextLines = [
      input.datasheetId ? `Target MWS datasheetId: ${input.datasheetId}` : null,
      input.viewId ? `Target MWS viewId: ${input.viewId}` : null,
      input.fieldKey ? `Preferred fieldKey: ${input.fieldKey}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    return [
      {
        role: 'system',
        content: [
            'You are a powerful data administrator for WikiLive tables.',
            'Your goal is to change the real MWS table data through tools, not by describing JSON to the user.',
            'If the user asks to fill fields, add data, update rows, or change table structure, use tools silently on the backend.',
            'For any table mutation task, call get_records first if you need current table data.',
            'After reading records, use patch_records, create_records, or add_table_column as needed.',
            'If the question is about records, rows, or table content, use get_records.',
            'If the user asks to add a new table column, use add_table_column.',
            'If the user asks to fill empty fields, patch existing records instead of answering with code or JSON.',
          'When tool arguments require a datasheetId, use the exact Target MWS datasheetId from the context.',
            'Only answer the user after the table has already been changed by tools.',
            'Keep the answer concise, factual, and grounded in the provided context or tool output.',
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          `Question: ${question}`,
          tableContextLines || null,
          contextMarkdown ? `Page context:\n${contextMarkdown}` : null,
        ].filter(Boolean).join('\n\n'),
      },
    ];
  }

  private snapshotToMarkdown(snapshot?: Record<string, unknown> | string): string {
    if (!snapshot) {
      return '';
    }

    if (typeof snapshot === 'string') {
      return snapshot.trim();
    }

    const lines: string[] = [];
    const visit = (node: any): void => {
      if (!node || typeof node !== 'object') {
        return;
      }

      if (node.type === 'doc' && Array.isArray(node.content)) {
        node.content.forEach(visit);
        return;
      }

      if (node.type === 'heading') {
        lines.push(`${'#'.repeat(Math.max(1, Math.min(6, Number(node.attrs?.level ?? 1))))} ${this.collectText(node)}`.trim());
        return;
      }

      if (node.type === 'paragraph') {
        lines.push(this.collectText(node));
        return;
      }

      if (node.type === 'bulletList' || node.type === 'orderedList') {
        (node.content ?? []).forEach(visit);
        return;
      }

      if (node.type === 'listItem') {
        lines.push(`- ${this.collectText(node)}`);
        return;
      }

      if (typeof node.text === 'string') {
        lines.push(node.text);
      }
    };

    visit(snapshot);
    return lines.filter((line) => line.trim()).join('\n');
  }

  private collectText(node: any): string {
    const parts: string[] = [];
    const walk = (value: any): void => {
      if (!value || typeof value !== 'object') {
        return;
      }

      if (typeof value.text === 'string') {
        parts.push(value.text);
      }

      if (Array.isArray(value.content)) {
        value.content.forEach(walk);
      }
    };

    walk(node);
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  private parseToolArguments(value: string): Record<string, unknown> {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

}