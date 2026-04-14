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
    const isTableContext = this.isTableContext(input);
    const isWorkspaceAgentMode = this.isWorkspaceAgentMode(input, isTableContext);
    const retrievedContext = isWorkspaceAgentMode ? { items: [] } : await this.searchRelevantContext(input, user);
    const messages = this.buildMessages(
      input.question,
      contextMarkdown,
      explicitContextMarkdown,
      retrievedContext.items,
      input,
      isTableContext,
      isWorkspaceAgentMode,
    );

    const toolDefinitions = this.aiToolRegistryService.getToolDefinitions().filter((definition) => {
      if (isTableContext) {
        return ['create_records', 'patch_records', 'get_records', 'add_table_column'].includes(definition.function.name);
      }

      if (isWorkspaceAgentMode) {
        return ['list_workspace_nodes', 'search_workspace_documents', 'get_document_context'].includes(
          definition.function.name,
        );
      }

      return false;
    });
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
      toolChoice: isTableContext || isWorkspaceAgentMode ? 'auto' : 'none',
    });

    for (let round = 0; round < (isWorkspaceAgentMode ? 4 : 3); round += 1) {
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

        references.push(...this.extractReferencesFromToolResult(toolName, toolResult));

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
    const sanitizedAnswer = this.sanitizeAssistantAnswer(answer);

    if (!sanitizedAnswer) {
      throw new BadRequestException({
        code: 'AI_CHAT_EMPTY',
        message: 'AI chat response is empty',
      });
    }

    return {
      answer: sanitizedAnswer,
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
    isTableContext: boolean,
    isWorkspaceAgentMode: boolean,
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
    const workspaceStructureSummary = this.formatWorkspaceStructureSummary(input.workspaceStructure);

    const systemContent = isTableContext
      ? [
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
        ].join(' ')
      : isWorkspaceAgentMode
        ? [
            'You are a WikiLive workspace research agent.',
            'Always answer in the same language as the user input. If language is ambiguous, default to Russian.',
            'Treat the provided workspace structure only as a navigation hint, not as factual evidence.',
            'Do not invent facts from file names or folder names.',
            'To answer questions about a whole space or folder scope, first use tools.',
            'Use search_workspace_documents to find candidate documents by query.',
            'Use get_document_context to open and read the most relevant documents before answering.',
            'Use list_workspace_nodes if you need to inspect the folder structure.',
            'If the first search is weak, refine the query and search again.',
            'If you cannot find supporting documents, explicitly say that the data was not found in the explored context.',
            'Do not answer from assumptions when the workspace scope is broad.',
            'Prefer short iterative searches over guessing.',
            'Never expose tool call markup, XML-like control tokens, or internal tool syntax in the final answer.',
            'After using tools, return only the user-facing answer.',
          ].join(' ')
        : [
          'You are a helpful WikiLive document assistant.',
          'Always answer in the same language as the user input. If language is ambiguous, default to Russian.',
          'Use the provided page context, selected document context, and retrieved workspace context as your primary source of truth.',
          'If enough context is provided, answer directly and concisely.',
          'If the question asks for a very short format such as one word, one phrase, or a title, follow that format strictly.',
          'Do not say that context is missing if page or retrieved context is provided.',
          'If context is genuinely absent, clearly say that no text was provided.',
          'Do not invent facts outside the provided context.',
        ].join(' ');

    return [
      {
        role: 'system',
        content: systemContent,
      },
      {
        role: 'user',
        content: [
          `Question: ${question}`,
          input.contextScope ? `Context scope: ${input.contextScope}` : null,
          input.selectedFolderIds?.length ? `Selected folder ids: ${input.selectedFolderIds.join(', ')}` : null,
          input.selectedPageIds?.length ? `Selected page ids: ${input.selectedPageIds.join(', ')}` : null,
          tableContextLines || null,
          workspaceStructureSummary ? `Workspace structure summary:\n${workspaceStructureSummary}` : null,
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

  private formatWorkspaceStructureSummary(
    workspaceStructure?: ChatQuestionInput['workspaceStructure'],
  ): string {
    if (!workspaceStructure?.nodes?.length) {
      return '';
    }

    const lines = workspaceStructure.nodes.slice(0, 48).map((node) => {
      const indent = '  '.repeat(Math.max(0, Math.min(4, node.depth)));
      return `${indent}- [${node.kind}] ${node.title} (id=${node.id}${node.parentId ? ` parent=${node.parentId}` : ''})`;
    });

    if (workspaceStructure.truncated) {
      lines.push('- ...structure truncated...');
    }

    return [`Scope spaceId=${workspaceStructure.spaceId}`, ...lines].join('\n');
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

    if (typeof snapshot.markdown === 'string') {
      return snapshot.markdown.trim();
    }

    if (typeof snapshot.text === 'string') {
      return snapshot.text.trim();
    }

    if (typeof snapshot.content === 'string') {
      return snapshot.content.trim();
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

  private isTableContext(input: ChatQuestionInput): boolean {
    return Boolean(input.datasheetId || input.viewId);
  }

  private isWorkspaceAgentMode(input: ChatQuestionInput, isTableContext: boolean): boolean {
    if (isTableContext) {
      return false;
    }

    return input.contextScope === 'space' || input.contextScope === 'folders';
  }

  private extractReferencesFromToolResult(toolName: string, toolResult: ToolExecutionResult): Array<Record<string, unknown>> {
    if (!toolResult.ok) {
      return [];
    }

    if (toolName === 'search_workspace_documents' && Array.isArray(toolResult.data.items)) {
      return toolResult.data.items.map((item) => ({
        type: 'workspace_search_hit',
        ...(item as Record<string, unknown>),
      }));
    }

    if (toolName === 'get_document_context' && toolResult.data.pageId) {
      return [
        {
          type: 'document_context',
          pageId: toolResult.data.pageId,
          title: toolResult.data.title,
        },
      ];
    }

    return [];
  }

  private parseToolArguments(value: string): Record<string, unknown> {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private sanitizeAssistantAnswer(answer: string): string {
    return answer
      .replace(/<\|tool_calls_section_begin\|>[\s\S]*?<\|tool_calls_section_end\|>/g, '')
      .replace(/<\|tool_call_begin\|>[\s\S]*?<\|tool_call_end\|>/g, '')
      .replace(/<\|tool_call_argument_begin\|>/g, '')
      .replace(/<\|tool_call_argument_end\|>/g, '')
      .trim();
  }

}
