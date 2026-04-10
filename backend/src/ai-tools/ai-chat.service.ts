import { BadRequestException, Injectable } from '@nestjs/common';
import { UserContext } from 'src/auth/user-context';
import { MwsService } from 'src/mws/mws.service';
import { AiProviderClientService, AiChatMessage } from './ai-provider-client.service';
import { ChatQuestionInput, ChatQuestionResponse, AiChatToolDefinition } from './ai-chat.types';

@Injectable()
export class AiChatService {
  constructor(
    private readonly aiProviderClientService: AiProviderClientService,
    private readonly mwsService: MwsService,
  ) {}

  getToolDefinitions(): AiChatToolDefinition[] {
    return [
      {
        type: 'function',
        function: {
          name: 'get_mws_records',
          description: 'Read records from MWS Tables and return canonical rows for answering user questions',
          parameters: {
            type: 'object',
            required: ['datasheetId'],
            properties: {
              datasheetId: { type: 'string' },
              viewId: { type: 'string' },
              pageSize: { type: 'integer', minimum: 1, maximum: 100 },
              pageNum: { type: 'integer', minimum: 1, maximum: 1000 },
              fields: { type: 'array', items: { type: 'string' } },
              filterByFormula: { type: 'string' },
              fieldKey: { type: 'string', enum: ['id'] },
            },
            additionalProperties: false,
          },
        },
      },
    ];
  }

  async askQuestion(input: ChatQuestionInput, user: UserContext): Promise<ChatQuestionResponse> {
    const contextMarkdown = this.snapshotToMarkdown(input.pageSnapshot);
    const messages = this.buildMessages(input.question, contextMarkdown);

    const toolCalls = this.shouldQueryMws(input)
      ? [
          {
            name: 'get_mws_records',
            arguments: {
              datasheetId: input.datasheetId,
              viewId: input.viewId,
              pageSize: 20,
              pageNum: 1,
              fieldKey: 'id',
            },
          },
        ]
      : [];

    const assistantResponse = await this.aiProviderClientService.complete({
      messages,
      temperature: 0.25,
      maxTokens: 512,
      tools: this.getToolDefinitions(),
      toolChoice: toolCalls.length > 0 ? 'auto' : 'none',
    });

    const modelToolCall = assistantResponse.choices?.[0]?.message?.tool_calls?.[0];
    const activeToolCall = modelToolCall
      ? {
          name: modelToolCall.function.name,
          arguments: this.parseToolArguments(modelToolCall.function.arguments),
        }
      : toolCalls[0];

    const references: Array<Record<string, unknown>> = [];
    let answer = String(assistantResponse.choices?.[0]?.message?.content ?? '').trim();

    if (activeToolCall?.name === 'get_mws_records') {
      const toolResult = await this.executeTool(activeToolCall.name, activeToolCall.arguments, user);
      references.push(...toolResult.items.map((item) => ({ ...item })));
      answer = answer || this.formatRecordsAnswer(toolResult.items);
    }

    if (!answer) {
      throw new BadRequestException({
        code: 'AI_CHAT_EMPTY',
        message: 'AI chat response is empty',
      });
    }

    return {
      answer,
      usedTools: activeToolCall ? [{ toolName: activeToolCall.name, args: activeToolCall.arguments }] : [],
      contextMarkdown,
      references,
    };
  }

  async executeTool(
    toolName: 'get_mws_records',
    args: Record<string, unknown>,
    user: UserContext,
  ): Promise<{ items: Array<{ recordId: string; fields: Record<string, unknown> }>; pageNum: number; pageSize: number; total: number }> {
    if (toolName !== 'get_mws_records') {
      throw new BadRequestException({ code: 'AI_CHAT_TOOL_UNSUPPORTED', message: `Unsupported tool: ${toolName}` });
    }

    const datasheetId = String(args.datasheetId ?? '');
    if (!datasheetId) {
      throw new BadRequestException({
        code: 'AI_CHAT_TOOL_INVALID_ARGS',
        message: 'datasheetId is required for get_mws_records',
      });
    }

    const result = await this.mwsService.listRecords(datasheetId, {
      viewId: typeof args.viewId === 'string' ? args.viewId : undefined,
      pageSize: typeof args.pageSize === 'number' ? args.pageSize : 20,
      pageNum: typeof args.pageNum === 'number' ? args.pageNum : 1,
      fields: Array.isArray(args.fields) ? args.fields.join(',') : undefined,
      filterByFormula: typeof args.filterByFormula === 'string' ? args.filterByFormula : undefined,
      fieldKey: 'id',
      cellFormat: 'json',
    }, user);

    return {
      items: this.toCanonicalRecords(result.items),
      pageNum: result.pageNum,
      pageSize: result.pageSize,
      total: result.total,
    };
  }

  private buildMessages(question: string, contextMarkdown: string): AiChatMessage[] {
    return [
      {
        role: 'system',
        content: [
          'You are a wiki assistant that answers user questions using the page context and available tools.',
          'If the user asks about records, tasks, rows, or table content, use the get_mws_records tool.',
          'Keep the answer concise, factual, and grounded in the provided context or tool output.',
        ].join(' '),
      },
      {
        role: 'user',
        content: [
          `Question: ${question}`,
          contextMarkdown ? `Page context:\n${contextMarkdown}` : null,
        ].filter(Boolean).join('\n\n'),
      },
    ];
  }

  private shouldQueryMws(input: ChatQuestionInput): boolean {
    const lower = input.question.toLowerCase();
    return Boolean(input.datasheetId) && /(табл|задач|строк|запис|records|table)/i.test(lower);
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

  private toCanonicalRecords(items: Array<{ recordId?: string; fields?: Record<string, unknown> }>): Array<{ recordId: string; fields: Record<string, unknown> }> {
    return items.map((item) => ({
      recordId: String(item.recordId ?? ''),
      fields: item.fields ?? {},
    }));
  }

  private formatRecordsAnswer(items: Array<{ recordId: string; fields: Record<string, unknown> }>): string {
    if (!items.length) {
      return 'В таблице нет записей.';
    }

    const lines = items.slice(0, 5).map((item, index) => {
      const title = String(item.fields['Название'] ?? item.fields['Title'] ?? item.fields['name'] ?? `Запись ${index + 1}`);
      return `${index + 1}. ${title}`;
    });

    return ['Вот что есть в таблице:', ...lines].join('\n');
  }
}