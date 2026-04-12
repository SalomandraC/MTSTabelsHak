import { BadRequestException, Injectable } from '@nestjs/common';
import { AiProviderClientService, AiChatMessage } from './ai-provider-client.service';
import {
  PageContextInput,
  ProseMirrorDocument,
  TextTransformationType,
} from './ai-assistant.types';

const TRANSFORM_SYSTEM_PROMPTS: Record<TextTransformationType, string> = {
  professional: 'Rewrite the text in a concise, professional, enterprise tone without changing meaning.',
  shorten: 'Shorten the text aggressively while keeping the core meaning and important facts.',
  expand: 'Expand the text with clarifying detail, examples, and explicit structure while preserving intent.',
  fix_grammar: 'Fix grammar, punctuation, spelling, and style while preserving the original meaning and tone.',
};

const SAME_LANGUAGE_RULE =
  'Always answer in the same language as the input text. If the input text is Russian, the output must be only in Russian.';

@Injectable()
export class AiAssistantService {
  constructor(private readonly aiProviderClientService: AiProviderClientService) {}

  async getCompletion(currentText: string, context: PageContextInput = {}): Promise<{ text: string }> {
    const messages = this.buildCompletionMessages(currentText, context);
    const response = await this.aiProviderClientService.complete({
      messages,
      temperature: 0.25,
      maxTokens: 96,
    });

    const text = this.extractText(response);
    this.assertNonEmptyText(text, 'completion');
    return { text: text.trim() };
  }

  async generateContent(prompt: string, context: PageContextInput = {}): Promise<{ document: ProseMirrorDocument }> {
    const messages = this.buildGenerationMessages(prompt, context);
    const response = await this.aiProviderClientService.complete({
      messages,
      temperature: 0.3,
      maxTokens: 1200,
      responseFormat: 'json_object',
    });

    const jsonText = this.extractText(response);
    const document = this.parseDocument(jsonText);
    this.validateDocument(document);
    return { document };
  }

  async transformText(
    text: string,
    transformation: TextTransformationType,
    context: PageContextInput = {},
  ): Promise<{ text: string }> {
    const messages = this.buildTransformMessages(text, transformation, context);
    const response = await this.aiProviderClientService.complete({
      messages,
      temperature: transformation === 'shorten' ? 0.15 : 0.25,
      maxTokens: 256,
    });

    const output = this.extractText(response);
    this.assertNonEmptyText(output, 'transform');
    return { text: output.trim() };
  }

  async planTableMutation(input: {
    operation: 'create_records' | 'add_table_column';
    prompt: string;
    spaceId: string;
    datasheetId: string;
    viewId?: string;
    tableSnapshot?: {
      datasheetId?: string;
      viewId?: string | null;
      fields?: Array<Record<string, unknown>>;
      records?: Array<Record<string, unknown>>;
      total?: number;
      updatedAt?: number;
    };
  }): Promise<{ toolName: 'create_records' | 'add_table_column'; args: Record<string, unknown>; summary: string }> {
    const messages: AiChatMessage[] = [
      {
        role: 'system',
        content: [
          'You convert user prompt to a strictly valid JSON command for MWS tools.',
          'Output only JSON object with keys: toolName, args, summary.',
          'Allowed toolName values: create_records, add_table_column.',
          'For create_records args must include datasheetId, fieldKey:"id", records:[{fields:{...}}].',
          'For add_table_column args must include spaceId, datasheetId, name, type, optional property.',
          'Never ask clarifying questions. Use table snapshot and user prompt directly.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({
          operation: input.operation,
          prompt: input.prompt,
          spaceId: input.spaceId,
          datasheetId: input.datasheetId,
          viewId: input.viewId,
          tableSnapshot: input.tableSnapshot ?? null,
        }),
      },
    ];

    const response = await this.aiProviderClientService.complete({
      messages,
      temperature: 0.1,
      maxTokens: 700,
      responseFormat: 'json_object',
    });

    const raw = this.extractText(response);
    let parsed: Record<string, unknown>;

    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new BadRequestException({
        code: 'AI_RESPONSE_INVALID_JSON',
        message: 'AI mutation plan is not valid JSON',
      });
    }

    const toolName = String(parsed.toolName ?? input.operation) as 'create_records' | 'add_table_column';
    const args = (parsed.args && typeof parsed.args === 'object' ? parsed.args : {}) as Record<string, unknown>;
    const summary = String(parsed.summary ?? 'Команда подготовлена');

    if (toolName === 'create_records') {
      return {
        toolName,
        args: {
          datasheetId: String(args.datasheetId ?? input.datasheetId),
          fieldKey: 'id',
          records: Array.isArray(args.records) ? args.records : [],
        },
        summary,
      };
    }

    return {
      toolName: 'add_table_column',
      args: {
        spaceId: String(args.spaceId ?? input.spaceId),
        datasheetId: String(args.datasheetId ?? input.datasheetId),
        name: String(args.name ?? 'Новая колонка'),
        type: String(args.type ?? 'SingleText'),
        property: args.property,
      },
      summary,
    };
  }

  buildCompletionMessages(currentText: string, context: PageContextInput = {}): AiChatMessage[] {
    return [
      {
        role: 'system',
        content: [
          'You are a ghost-text assistant for a wiki editor.',
          'Continue the current text with a short, natural continuation.',
          'Do not explain your reasoning.',
          'Keep the output brief, relevant, and ready to insert directly into the editor.',
        ].join(' '),
      },
      {
        role: 'user',
        content: this.renderPromptBlock({
          title: context.pageTitle,
          heading: 'Current text',
          body: currentText,
        }),
      },
    ];
  }

  buildGenerationMessages(prompt: string, context: PageContextInput = {}): AiChatMessage[] {
    return [
      {
        role: 'system',
        content: [
          'You generate ProseMirror JSON for a Tiptap document.',
          'Return only valid JSON.',
          'The document must have type "doc" and a content array.',
          'Use only paragraph, heading, bulletList, orderedList, listItem, blockquote, and text nodes unless the context requires another common ProseMirror node.',
        ].join(' '),
      },
      {
        role: 'user',
        content: this.renderPromptBlock({
          title: context.pageTitle,
          heading: 'Generation prompt',
          body: prompt,
        }) + this.renderContextSnapshot(context.pageSnapshot),
      },
    ];
  }

  buildTransformMessages(
    text: string,
    transformation: TextTransformationType,
    context: PageContextInput = {},
  ): AiChatMessage[] {
    return [
      {
        role: 'system',
        content: `${TRANSFORM_SYSTEM_PROMPTS[transformation]} ${SAME_LANGUAGE_RULE}`,
      },
      {
        role: 'user',
        content: this.renderPromptBlock({
          title: context.pageTitle,
          heading: `Transformation: ${transformation}`,
          body: text,
        }) + this.renderContextSnapshot(context.pageSnapshot),
      },
    ];
  }

  private extractText(response: { choices?: Array<{ message?: { content?: string | null } }> }): string {
    return String(response.choices?.[0]?.message?.content ?? '').trim();
  }

  private parseDocument(rawText: string): ProseMirrorDocument {
    try {
      return JSON.parse(rawText) as ProseMirrorDocument;
    } catch {
      throw new BadRequestException({
        code: 'AI_RESPONSE_INVALID_JSON',
        message: 'AI response is not valid JSON',
      });
    }
  }

  private validateDocument(document: ProseMirrorDocument): void {
    if (!document || document.type !== 'doc' || !Array.isArray(document.content)) {
      throw new BadRequestException({
        code: 'AI_DOCUMENT_INVALID',
        message: 'AI response does not contain valid ProseMirror JSON',
      });
    }
  }

  private assertNonEmptyText(value: string, operation: string): void {
    if (!value || !value.trim()) {
      throw new BadRequestException({
        code: 'AI_RESPONSE_EMPTY',
        message: `AI ${operation} response is empty`,
      });
    }
  }

  private renderPromptBlock(input: { title?: string; heading: string; body: string }): string {
    return [
      input.title ? `Page title: ${input.title}` : null,
      `${input.heading}:`,
      input.body.trim(),
    ]
      .filter(Boolean)
      .join('\n');
  }

  private renderContextSnapshot(snapshot?: Record<string, unknown> | string): string {
    if (!snapshot) {
      return '';
    }

    const markdown = typeof snapshot === 'string' ? snapshot : this.proseMirrorToMarkdown(snapshot);
    return `\n\nContext snapshot:\n${markdown}`;
  }

  private proseMirrorToMarkdown(snapshot: Record<string, unknown>): string {
    const lines: string[] = [];

    const visit = (node: any, depth = 0): void => {
      if (!node || typeof node !== 'object') {
        return;
      }

      switch (node.type) {
        case 'doc':
          (node.content ?? []).forEach((child: any) => visit(child, depth));
          break;
        case 'heading': {
          const level = Math.max(1, Math.min(6, Number(node.attrs?.level ?? 1)));
          lines.push(`${'#'.repeat(level)} ${this.collectText(node)}`.trim());
          break;
        }
        case 'paragraph':
          lines.push(this.collectText(node));
          break;
        case 'bulletList':
        case 'orderedList':
          (node.content ?? []).forEach((child: any) => visit(child, depth + 1));
          break;
        case 'listItem':
          lines.push(`${'  '.repeat(depth)}- ${this.collectText(node)}`.trimEnd());
          break;
        case 'blockquote':
          lines.push(`> ${this.collectText(node)}`);
          break;
        case 'mwsTableEmbed':
          lines.push(`[Embedded table: ${String(node.attrs?.datasheetId ?? 'unknown')}]`);
          break;
        default:
          if (Array.isArray(node.content)) {
            node.content.forEach((child: any) => visit(child, depth));
          }
      }
    };

    visit(snapshot);
    return lines.filter((line) => line.trim().length > 0).join('\n');
  }

  private collectText(node: any): string {
    if (typeof node?.text === 'string') {
      return node.text;
    }

    const pieces: string[] = [];
    const walk = (value: any): void => {
      if (!value || typeof value !== 'object') {
        return;
      }

      if (typeof value.text === 'string') {
        pieces.push(value.text);
      }

      if (Array.isArray(value.content)) {
        value.content.forEach(walk);
      }
    };

    walk(node);
    return pieces.join(' ').replace(/\s+/g, ' ').trim();
  }
}