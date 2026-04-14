import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProviderClientService, AiChatMessage } from './ai-provider-client.service';
import {
  AiIntent,
  PageContextInput,
  ProseMirrorDocument,
  TextStyleId,
  TextTransformationType,
} from './ai-assistant.types';

const TRANSFORM_SYSTEM_PROMPTS: Record<TextTransformationType, string> = {
  professional: 'Rewrite the text in a concise, professional, enterprise tone without changing meaning.',
  shorten: 'Shorten the text aggressively while keeping the core meaning and important facts.',
  expand: 'Expand the text with clarifying detail, examples, and explicit structure while preserving intent.',
  fix_grammar: 'Fix grammar, punctuation, spelling, and style while preserving the original meaning and tone.',
};

const STYLE_SYSTEM_PROMPTS: Record<TextStyleId, string> = {
  standard: 'Improve the text to be clear, natural, and coherent while preserving meaning and factual content.',
  business: 'Rewrite the text in a concise business style suitable for enterprise communication with clear structure.',
  military: 'Rewrite the text in a precise military operational style: concise commands, unambiguous wording, discipline-focused tone, no slang, preserving all facts.',
  medieval: 'Rewrite the text in a restrained medieval literary style while keeping facts and meaning accurate.',
  church: 'Rewrite the text in a respectful church-slavonic inspired style with biblical cadence. Use occasional scriptural framing and short quote-like constructions such as "ибо сказано" or "да будет", while preserving meaning, readability, and factual accuracy. Do not fabricate real scripture references.',
  fix: 'Fix grammar, punctuation, spelling, and syntax issues while keeping tone and meaning unchanged.',
  expand: 'Expand the text with clarifying detail, smoother transitions, and explicit structure while preserving intent.',
};

const SAME_LANGUAGE_RULE =
  'Always answer in the same language as the input text. If language is ambiguous or missing, default to Russian. If the input text is Russian, the output must be only in Russian.';

const PROFESSIONAL_TONE_RULE =
  'Always maintain a professional, concise Wiki-system tone.';

const LIVE_REFERENCE_STRICT_RULE =
  'When mentioning any numeric values, statuses, or dates that exist in provided MWS table context, you MUST use live reference token format [Ref:tableId:rowId:colId]. Never output a plain numeric/status/date value if it can be bound to a table cell. This keeps documents dynamic.';

const MARKDOWN_TABLE_RULE = [
  'Если тебе нужно представить данные в виде структуры, используй стандартные Markdown-таблицы.',
  'Формат:',
  '| Заголовок 1 | Заголовок 2 |',
  '|---|---|',
  '| Значение 1 | Значение 2 |',
  'Никогда не используй имитацию таблиц через пробелы или табуляцию. Только стандартный Markdown.',
].join(' ');

const TRANSFORM_OUTPUT_RULES = [
  'Return only the transformed selected fragment text, without comments or explanations.',
  'Do not output labels or metadata like "Page title", "Transformation", "Context snapshot", "Wiki", "Исходный текст", or "Переработанный вариант".',
  'Do not add markdown tables, separators, or horizontal rules unless they are already present in the selected fragment.',
  'Preserve the selected fragment structure: keep paragraph boundaries and line breaks semantically close to the input.',
].join(' ');

@Injectable()
export class AiAssistantService {
  private readonly modelChat: string;
  private readonly modelMutation: string;
  private readonly modelWriter: string;
  private readonly modelFast: string;

  constructor(
    private readonly aiProviderClientService: AiProviderClientService,
    private readonly configService: ConfigService,
  ) {
    this.modelChat = this.configService.get<string>('AI_MODEL_CHAT', 'qwen2.5-72b-instruct');
    this.modelMutation = this.configService.get<string>('AI_MODEL_MUTATION', 'qwen2.5-72b-instruct');
    this.modelWriter = this.configService.get<string>('AI_MODEL_WRITER', 'llama-3.3-70b-instruct');
    this.modelFast = this.configService.get<string>('AI_MODEL_FAST', 'llama-3.1-8b-instruct');
  }

  resolveModelForIntent(intent: AiIntent): string {
    switch (intent) {
      case 'autocomplete':
        return this.modelFast;
      case 'plan_mutation':
        return this.modelMutation;
      case 'write_report':
        return this.modelWriter;
      case 'chat':
      default:
        return this.modelChat;
    }
  }

  async getCompletion(currentText: string, context: PageContextInput = {}): Promise<{ text: string }> {
    const messages = this.buildCompletionMessages(currentText, context);
    const response = await this.aiProviderClientService.complete({
      model: this.resolveModelForIntent('autocomplete'),
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
      model: this.resolveModelForIntent('chat'),
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
    styleId: TextStyleId | undefined = undefined,
    context: PageContextInput = {},
  ): Promise<{ text: string }> {
    const messages = this.buildTransformMessages(text, transformation, styleId, context);
    const response = await this.aiProviderClientService.complete({
      model: this.resolveModelForIntent('chat'),
      messages,
      temperature: transformation === 'shorten' ? 0.15 : 0.25,
      maxTokens: 256,
    });

    const output = this.extractText(response);
    const sanitizedOutput = this.sanitizeTransformOutput(output, text);
    this.assertNonEmptyText(sanitizedOutput, 'transform');
    return { text: sanitizedOutput.trim() };
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
          'If tableSnapshot has missing or empty records, assume caller will fetch data with get_records before execution and still produce a valid command.',
          'Prioritize updating existing records over creating new rows when the prompt asks to fill or modify existing data.',
          'Use create_records only for clearly new unique entities.',
          'If prompt includes row ranges (for example "rows 1-3" or "строки 1-3"), treat it as UPDATE_RECORDS intent for existing rows.',
          'Never ask clarifying questions. Use table snapshot and user prompt directly.',
          SAME_LANGUAGE_RULE,
          PROFESSIONAL_TONE_RULE,
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
      model: this.resolveModelForIntent('plan_mutation'),
      messages,
      temperature: 0.1,
      maxTokens: 700,
      responseFormat: 'json_object',
    });

    const raw = this.extractText(response);
    const parsed = await this.parseJsonObjectWithRecovery(raw, {
      operation: 'table-mutation',
      requiredTopLevelKeys: ['toolName', 'args', 'summary'],
    });

    const toolName = String(parsed.toolName ?? input.operation) as 'create_records' | 'add_table_column';
    const args = (parsed.args && typeof parsed.args === 'object' ? parsed.args : {}) as Record<string, unknown>;
    const summary = String(parsed.summary ?? 'Команда подготовлена');

    if (toolName === 'create_records') {
      const command = {
        toolName,
        args: {
          datasheetId: String(args.datasheetId ?? input.datasheetId),
          fieldKey: 'id',
          records: Array.isArray(args.records) ? args.records : [],
        },
        summary,
      };

      console.log('SYNC COMMAND GENERATED:', command);
      return command;
    }

    const command: { toolName: 'add_table_column'; args: Record<string, unknown>; summary: string } = {
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

    console.log('SYNC COMMAND GENERATED:', command);
    return command;
  }

  async planTableWorkflow(input: {
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
  }): Promise<{
    summary: string;
    commands: Array<
      | {
          type: 'ADD_COLUMN';
          column: {
            name: string;
            type: string;
            property?: Record<string, unknown>;
          };
        }
      | {
          type: 'ADD_ROW';
          rows: Array<{ fields: Record<string, unknown> }>;
        }
      | {
          type: 'UPDATE_RECORDS';
          records: Array<{ recordId: string; fields: Record<string, unknown> }>;
        }
    >;
  }> {
    if (this.isFillAllEmptyFieldsIntent(input.prompt)) {
      return this.buildFillEmptyFieldsWorkflowPlan(input);
    }

    const messages: AiChatMessage[] = [
      {
        role: 'system',
        content: [
          'You are a table workflow planner for WikiLive.',
          'Analyze the current table context and the user prompt.',
          'Return only JSON with keys: summary, commands.',
          'commands must be an array of workflow commands.',
          'Allowed command types: ADD_COLUMN, ADD_ROW, UPDATE_RECORDS.',
          'For ADD_COLUMN output {"type":"ADD_COLUMN","column":{"name":"...","type":"...","property":{...}?}}.',
          'For ADD_ROW output {"type":"ADD_ROW","rows":[{"fields":{...}}]}.',
          'For UPDATE_RECORDS output {"type":"UPDATE_RECORDS","records":[{"recordId":"...","fields":{...}}]}.',
          'When user asks to fill or enrich existing rows, prefer UPDATE_RECORDS and do not create duplicate rows.',
          'If user specifies row indexes or ranges (for example 1-6), treat it as updating existing rows via UPDATE_RECORDS.',
          'If user specifies row ranges (for example "rows 1-3" or "строки 1-3"), always treat it as direct UPDATE_RECORDS intent.',
          'Use ADD_ROW only for new unique entities that do not already exist in the current rows.',
          'Do not use ADD_ROW for tasks that target existing rows.',
          'Prefer creating columns first when existing columns do not match the task.',
          'If the snapshot is empty or insufficient, infer the needed schema from the prompt and still propose valid commands.',
          'Use fieldKey id compatible row values.',
          'Never ask clarifying questions.',
          SAME_LANGUAGE_RULE,
          PROFESSIONAL_TONE_RULE,
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({
          prompt: input.prompt,
          spaceId: input.spaceId,
          datasheetId: input.datasheetId,
          viewId: input.viewId,
          tableSnapshot: input.tableSnapshot ?? null,
        }),
      },
    ];

    const response = await this.aiProviderClientService.complete({
      model: this.resolveModelForIntent('plan_mutation'),
      messages,
      temperature: 0.15,
      maxTokens: 900,
      responseFormat: 'json_object',
    });

    const raw = this.extractText(response);
    let parsed: Record<string, unknown>;

    try {
      parsed = await this.parseJsonObjectWithRecovery(raw, {
        operation: 'table-workflow',
        requiredTopLevelKeys: ['summary', 'commands'],
      });
    } catch (error) {
      console.warn('AI workflow JSON parse failed, using deterministic fallback plan', {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.buildFallbackWorkflowPlan(input);
    }

    const summary = String(parsed.summary ?? 'План готов');
    const commands = Array.isArray(parsed.commands) ? parsed.commands : [];

    const normalizedCommands = commands
      .map((command: any) => {
        if (command?.type === 'ADD_COLUMN') {
          return {
            type: 'ADD_COLUMN' as const,
            column: {
              name: String(command.column?.name ?? 'Новая колонка'),
              type: String(command.column?.type ?? 'SingleText'),
              property: command.column?.property && typeof command.column.property === 'object'
                ? (command.column.property as Record<string, unknown>)
                : undefined,
            },
          };
        }

        if (command?.type === 'ADD_ROW') {
          return {
            type: 'ADD_ROW' as const,
            rows: Array.isArray(command.rows)
              ? command.rows.map((row: any) => ({
                  fields: row?.fields && typeof row.fields === 'object' ? (row.fields as Record<string, unknown>) : {},
                }))
              : [],
          };
        }

        if (command?.type === 'UPDATE_RECORDS') {
          return {
            type: 'UPDATE_RECORDS' as const,
            records: Array.isArray(command.records)
              ? command.records
                  .map((record: any) => ({
                    recordId: String(record?.recordId ?? ''),
                    fields:
                      record?.fields && typeof record.fields === 'object'
                        ? (record.fields as Record<string, unknown>)
                        : {},
                  }))
                  .filter((record: { recordId: string }) => record.recordId.length > 0)
              : [],
          };
        }

        return null;
      })
      .filter(Boolean) as Array<
        | {
            type: 'ADD_COLUMN';
            column: { name: string; type: string; property?: Record<string, unknown> };
          }
        | {
            type: 'ADD_ROW';
            rows: Array<{ fields: Record<string, unknown> }>;
          }
        | {
            type: 'UPDATE_RECORDS';
            records: Array<{ recordId: string; fields: Record<string, unknown> }>;
          }
      >;

    const command = { summary, commands: normalizedCommands };

    if (this.isFillAllEmptyFieldsIntent(input.prompt) && normalizedCommands.length === 0) {
      return this.buildFillEmptyFieldsWorkflowPlan(input);
    }

    console.log('SYNC COMMAND GENERATED:', command);
    return command;
  }

  private isFillAllEmptyFieldsIntent(prompt: string): boolean {
    const value = String(prompt ?? '').toLowerCase();

    const hasFillVerb = /(заполни|заполнить|fill|populate|дополни|добавь\s+данные)/i.test(value);
    const hasEmptyTarget = /(пуст(ые|ые\s+поля|ые\s+строки|ые\s+ячейки|ых\s+пол(я|ей)|ых\s+строк)|empty\s+(fields|cells|rows))/i.test(value);
    const hasAllQuantifier = /(все|во\s+все|all)/i.test(value);

    return hasFillVerb && hasEmptyTarget && hasAllQuantifier;
  }

  private buildFillEmptyFieldsWorkflowPlan(input: {
    prompt: string;
    tableSnapshot?: {
      fields?: Array<Record<string, unknown>>;
      records?: Array<Record<string, unknown>>;
    };
  }): {
    summary: string;
    commands: Array<
      | {
          type: 'ADD_COLUMN';
          column: {
            name: string;
            type: string;
            property?: Record<string, unknown>;
          };
        }
      | {
          type: 'ADD_ROW';
          rows: Array<{ fields: Record<string, unknown> }>;
        }
      | {
          type: 'UPDATE_RECORDS';
          records: Array<{ recordId: string; fields: Record<string, unknown> }>;
        }
    >;
  } {
    const rawFields = Array.isArray(input.tableSnapshot?.fields) ? input.tableSnapshot?.fields ?? [] : [];
    const rawRecords = Array.isArray(input.tableSnapshot?.records) ? input.tableSnapshot?.records ?? [] : [];

    const fields: Array<{ id: string; type: string; name: string; property?: Record<string, unknown> }> = [];

    for (const field of rawFields) {
      const id = String(field.id ?? '');
      if (!id) {
        continue;
      }

      fields.push({
        id,
        type: String(field.type ?? 'SingleText'),
        name: String(field.name ?? id),
        property:
          field.property && typeof field.property === 'object'
            ? (field.property as Record<string, unknown>)
            : undefined,
      });
    }

    const records = rawRecords
      .map((record) => {
        const recordId = String(record.recordId ?? '');
        const rowFields =
          record.fields && typeof record.fields === 'object'
            ? (record.fields as Record<string, unknown>)
            : (record as Record<string, unknown>);

        if (!recordId) {
          return null;
        }

        return {
          recordId,
          fields: rowFields,
        };
      })
      .filter((record): record is { recordId: string; fields: Record<string, unknown> } => record !== null);

    if (fields.length === 0 || records.length === 0) {
      return {
        summary: 'Не удалось заполнить пустые поля: snapshot таблицы пустой.',
        commands: [],
      };
    }

    const updates = records
      .map((record, rowIndex) => {
        const patch: Record<string, unknown> = {};

        for (const field of fields) {
          const currentValue = record.fields[field.id];
          if (this.isEmptyCellValue(currentValue)) {
            patch[field.id] = this.buildSyntheticValue(field.type, rowIndex + 1);
          }
        }

        return {
          recordId: record.recordId,
          fields: patch,
        };
      })
      .filter((update) => Object.keys(update.fields).length > 0);

    return {
      summary: `Заполнены пустые поля в ${updates.length} строках`,
      commands: [
        {
          type: 'UPDATE_RECORDS',
          records: updates,
        },
      ],
    };
  }

  private buildFallbackWorkflowPlan(input: {
    prompt: string;
    tableSnapshot?: {
      fields?: Array<Record<string, unknown>>;
      records?: Array<Record<string, unknown>>;
    };
  }): {
    summary: string;
    commands: Array<
      | {
          type: 'ADD_COLUMN';
          column: {
            name: string;
            type: string;
            property?: Record<string, unknown>;
          };
        }
      | {
          type: 'ADD_ROW';
          rows: Array<{ fields: Record<string, unknown> }>;
        }
      | {
          type: 'UPDATE_RECORDS';
          records: Array<{ recordId: string; fields: Record<string, unknown> }>;
        }
    >;
  } {
    const rawFields = Array.isArray(input.tableSnapshot?.fields) ? input.tableSnapshot?.fields ?? [] : [];
    const rawRecords = Array.isArray(input.tableSnapshot?.records) ? input.tableSnapshot?.records ?? [] : [];

    const fields = rawFields
      .map((field) => {
        const id = String(field.id ?? '');
        const type = String(field.type ?? 'SingleText');
        const name = String(field.name ?? id);

        if (!id) {
          return null;
        }

        return { id, type, name };
      })
      .filter((field): field is { id: string; type: string; name: string } => field !== null);

    const records = rawRecords
      .map((record) => {
        const recordId = String(record.recordId ?? '');
        const rowFields =
          record.fields && typeof record.fields === 'object'
            ? (record.fields as Record<string, unknown>)
            : (record as Record<string, unknown>);

        if (!recordId) {
          return null;
        }

        return {
          recordId,
          fields: rowFields,
        };
      })
      .filter((record): record is { recordId: string; fields: Record<string, unknown> } => record !== null);

    if (fields.length === 0 || records.length === 0) {
      return {
        summary: 'Не удалось прочитать структуру таблицы из snapshot, fallback-план пустой.',
        commands: [],
      };
    }

    const range = this.parseRequestedRowRange(input.prompt);
    const start = range?.start ?? 1;
    const end = Math.min(range?.end ?? records.length, records.length);
    const slice = records.slice(Math.max(0, start - 1), end);

    const updates = slice.map((record, rowIndex) => {
      const patch: Record<string, unknown> = {};

      for (const field of fields) {
        const currentValue = record.fields[field.id];
        if (this.isEmptyCellValue(currentValue)) {
          patch[field.id] = this.buildSyntheticValue(field.type, rowIndex + 1);
        }
      }

      if (Object.keys(patch).length === 0) {
        const textField = fields.find((field) => this.isTextFieldType(field.type)) ?? fields[0];
        patch[textField.id] = `Обновлено ${rowIndex + 1}`;
      }

      return {
        recordId: record.recordId,
        fields: patch,
      };
    });

    return {
      summary: `Fallback-план: обновить существующие строки ${start}-${end}`,
      commands: [
        {
          type: 'UPDATE_RECORDS',
          records: updates,
        },
      ],
    };
  }

  private parseRequestedRowRange(prompt: string): { start: number; end: number } | null {
    const value = String(prompt ?? '');

    const dashRange = value.match(/(?:строк[аи]?|rows?)\s*(\d{1,4})\s*[-–—]\s*(\d{1,4})/i);
    if (dashRange) {
      const start = Number(dashRange[1]);
      const end = Number(dashRange[2]);
      if (Number.isFinite(start) && Number.isFinite(end) && start > 0 && end >= start) {
        return { start, end };
      }
    }

    const fromToRange = value.match(/(?:строк[аи]?|rows?)\s*с\s*(\d{1,4})\s*по\s*(\d{1,4})/i);
    if (fromToRange) {
      const start = Number(fromToRange[1]);
      const end = Number(fromToRange[2]);
      if (Number.isFinite(start) && Number.isFinite(end) && start > 0 && end >= start) {
        return { start, end };
      }
    }

    return null;
  }

  private isTextFieldType(type: string): boolean {
    const normalized = String(type).toLowerCase();
    return normalized.includes('text') || normalized.includes('string') || normalized.includes('single');
  }

  private isEmptyCellValue(value: unknown): boolean {
    if (value === null || value === undefined) {
      return true;
    }

    if (typeof value === 'string') {
      return value.trim().length === 0;
    }

    if (Array.isArray(value)) {
      return value.length === 0;
    }

    return false;
  }

  private buildSyntheticValue(type: string, index: number): unknown {
    const normalized = String(type).toLowerCase();

    if (normalized.includes('number') || normalized.includes('currency') || normalized.includes('rating')) {
      return index * 10;
    }

    if (normalized.includes('checkbox') || normalized.includes('bool')) {
      return index % 2 === 0;
    }

    if (normalized.includes('date')) {
      return `2026-01-${String(Math.max(1, Math.min(28, index))).padStart(2, '0')}`;
    }

    if (normalized.includes('multi') || normalized.includes('select')) {
      return ['Обновлено'];
    }

    return `Обновлено ${index}`;
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
          SAME_LANGUAGE_RULE,
          PROFESSIONAL_TONE_RULE,
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
          'If user asks to reference a live MWS cell, insert token [Ref:tableId:rowId:colId] directly in text, without extra markup.',
          LIVE_REFERENCE_STRICT_RULE,
          MARKDOWN_TABLE_RULE,
          SAME_LANGUAGE_RULE,
          PROFESSIONAL_TONE_RULE,
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
    styleId: TextStyleId | undefined = undefined,
    context: PageContextInput = {},
  ): AiChatMessage[] {
    const prompt = styleId ? STYLE_SYSTEM_PROMPTS[styleId] : TRANSFORM_SYSTEM_PROMPTS[transformation];

    return [
      {
        role: 'system',
        content: `${prompt} ${SAME_LANGUAGE_RULE} ${PROFESSIONAL_TONE_RULE} ${MARKDOWN_TABLE_RULE} ${TRANSFORM_OUTPUT_RULES}`,
      },
      {
        role: 'user',
        content: this.renderPromptBlock({
          title: context.pageTitle,
          heading: `Transformation: ${transformation}${styleId ? ` (style: ${styleId})` : ''}`,
          body: text,
        }) + this.renderContextSnapshot(context.pageSnapshot),
      },
    ];
  }

  private extractText(response: { choices?: Array<{ message?: { content?: string | null } }> }): string {
    return String(response.choices?.[0]?.message?.content ?? '').trim();
  }

  private tryParseJsonObject(rawText: string): Record<string, unknown> | null {
    const normalized = String(rawText ?? '').trim();
    if (!normalized) {
      return null;
    }

    const candidates: string[] = [normalized];

    const fenced = normalized.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) {
      candidates.push(fenced[1].trim());
    }

    const firstBrace = normalized.indexOf('{');
    const lastBrace = normalized.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      candidates.push(normalized.slice(firstBrace, lastBrace + 1).trim());
    }

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // Ignore candidate parse failures and keep trying alternatives.
      }
    }

    return null;
  }

  private async parseJsonObjectWithRecovery(
    rawText: string,
    options: { operation: string; requiredTopLevelKeys: string[] },
  ): Promise<Record<string, unknown>> {
    const direct = this.tryParseJsonObject(rawText);
    if (direct) {
      return direct;
    }

    const repairResponse = await this.aiProviderClientService.complete({
      model: this.resolveModelForIntent('plan_mutation'),
      messages: [
        {
          role: 'system',
          content: [
            'You are a JSON repair assistant.',
            'Given model output that should be JSON, return only one valid JSON object.',
            `Required top-level keys: ${options.requiredTopLevelKeys.join(', ')}.`,
            'Do not add prose, markdown fences, or comments.',
          ].join(' '),
        },
        {
          role: 'user',
          content: rawText,
        },
      ],
      temperature: 0,
      maxTokens: 900,
      responseFormat: 'json_object',
    });

    const repairedRaw = this.extractText(repairResponse);
    const repaired = this.tryParseJsonObject(repairedRaw);
    if (repaired) {
      return repaired;
    }

    throw new BadRequestException({
      code: 'AI_RESPONSE_INVALID_JSON',
      message: `AI ${options.operation} plan is not valid JSON`,
    });
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

  private sanitizeTransformOutput(rawOutput: string, sourceText: string): string {
    let value = String(rawOutput ?? '').trim();
    if (!value) {
      return value;
    }

    const lines = value.split(/\r?\n/);
    const filteredLines = lines.filter((line) => {
      const normalized = line.trim().toLowerCase();

      if (/^(page\s+title|transformation|context\s+snapshot)\s*:/i.test(normalized)) {
        return false;
      }

      if (/^(wiki\s*:|исходный\s+текст|переработанный\s+вариант)/i.test(normalized)) {
        return false;
      }

      return true;
    });

    value = filteredLines.join('\n').trim();

    const sourceHasHorizontalRules = /(^|\n)\s*---+\s*(\n|$)/.test(sourceText);
    if (!sourceHasHorizontalRules) {
      value = value.replace(/(^|\n)\s*---+\s*(?=\n|$)/g, '$1').replace(/\n{3,}/g, '\n\n').trim();
    }

    return value;
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