import { BadRequestException, Injectable } from '@nestjs/common';
import { UserContext } from 'src/auth/user-context';
import { ContextSearchService } from 'src/context-engine/context-search.service';
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
    private readonly contextSearchService: ContextSearchService,
  ) {}

  async askQuestion(input: ChatQuestionInput, user: UserContext): Promise<ChatQuestionResponse> {
    const contextMarkdown = this.snapshotToMarkdown(input.pageSnapshot);
    const explicitContextMarkdown = this.buildExplicitContextMarkdown(input.contextDocuments);
    const retrievedContext = await this.searchRelevantContext(input, user);
    const messages = this.buildMessages(
      input.question,
      contextMarkdown,
      explicitContextMarkdown,
      retrievedContext.items,
      input,
    );

    const toolDefinitions = this.aiToolRegistryService
      .getToolDefinitions()
      .filter((definition) => ['create_records', 'patch_records', 'get_records', 'add_table_column'].includes(definition.function.name));
    const conversation: AiChatMessage[] = [...messages];
    const usedTools: Array<{ toolName: string; args: Record<string, unknown> }> = [];
    const references: Array<Record<string, unknown>> = [
      ...retrievedContext.items.map((item) => ({
        type: 'page_chunk',
        pageId: item.pageId,
        title: item.title,
        score: item.score,
        snippet: item.snippet,
      })),
    ];
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

  private buildMessages(
    question: string,
    contextMarkdown: string,
    explicitContextMarkdown: string,
    retrievedContext: Array<{ pageId: string; title: string; snippet: string; score: number }>,
    input: ChatQuestionInput,
  ): AiChatMessage[] {
    const tableContextLines = [
      input.datasheetId ? `Target MWS datasheetId: ${input.datasheetId}` : null,
      input.viewId ? `Target MWS viewId: ${input.viewId}` : null,
      input.fieldKey ? `Preferred fieldKey: ${input.fieldKey}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const retrievedContextMarkdown = retrievedContext.length
      ? retrievedContext
          .map(
            (item, index) =>
              `### Контекст ${index + 1}: ${item.title}\n\n${item.snippet}\n\nscore=${item.score.toFixed(3)} pageId=${item.pageId}`,
          )
          .join('\n\n')
      : '';

    return [
      {
        role: 'system',
        content: [
            'You are a powerful data administrator for WikiLive tables.',
            'Your goal is to change the real MWS table data through tools, not by describing JSON to the user.',
            'Always maintain a professional, concise Wiki-system tone.',
            'Always answer in the same language as the user input. If language is ambiguous, default to Russian.',
            'If the user asks to fill fields, add data, update rows, or change table structure, use tools silently on the backend.',
            'For any table mutation task, call get_records first if you need current table data.',
            'After reading records, use patch_records, create_records, or add_table_column as needed.',
            'If the question is about records, rows, or table content, use get_records.',
            'If the user asks to add a new table column, use add_table_column.',
            'If the user asks to fill empty fields, patch existing records instead of answering with code or JSON.',
            'When filling or changing table data, always prioritize UPDATE of existing rows. Use CREATE only for new unique entities.',
            'If user specifies row ranges (for example "rows 1-3" or "строки 1-3"), treat this as direct update intent for existing rows.',
            'When mentioning any numeric values, statuses, or dates that exist in provided MWS table context, you MUST use live reference token format [Ref:tableId:rowId:colId]. Never output plain numeric/status/date values if they can be bound to table cells.',
            'If the user asks for totals, averages, taxes, percentages, deltas, or any computed metric, return the formula as [Formula: expression] and use [Ref:tableId:rowId:colId] tokens inside the expression whenever possible.',
            'If user asks for document structure or heading plan, return only anchor-based JSON array format [{"anchor":"...","title":"...","level":1|2|3}].',
            'For anchor-based structure: enforce strict hierarchy H1 -> H2 -> H3, keep titles short and informative, preserve automatic numbering unless user explicitly asks otherwise, and never propose a heading that duplicates an existing heading in the document context.',
            'If user asks for a report, assess expected report size. If report is likely long (more than 5 analysis points), start answer with [ACTION: CREATE_NEW_PAGE]. If report is short, start answer with [ACTION: INLINE_INSERT].',
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
          explicitContextMarkdown ? `Selected document context:\n${explicitContextMarkdown}` : null,
          retrievedContextMarkdown ? `Retrieved workspace context:\n${retrievedContextMarkdown}` : null,
        ].filter(Boolean).join('\n\n'),
      },
    ];
  }

  private buildExplicitContextMarkdown(
    documents?: Array<{
      pageId: string;
      title: string;
      markdown: string;
    }>,
  ): string {
    if (!documents?.length) {
      return '';
    }

    return documents
      .map((document) => `## ${document.title || document.pageId}\n\n${document.markdown?.trim() || 'Контекст недоступен'}`)
      .join('\n\n---\n\n');
  }

  private async searchRelevantContext(input: ChatQuestionInput, user: UserContext) {
    if (input.useVectorSearch === false || !input.spaceId) {
      return { items: [] as Array<{ pageId: string; title: string; snippet: string; score: number }> };
    }

    try {
      return await this.contextSearchService.searchInSpace(user, {
        spaceId: input.spaceId,
        query: input.question,
        pageIds: input.selectedPageIds,
        folderIds: input.selectedFolderIds,
        topK: 5,
      });
    } catch {
      return { items: [] as Array<{ pageId: string; title: string; snippet: string; score: number }> };
    }
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
