import { SendHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Editor } from '@tiptap/core';

import { type MwsField, type MwsRecord, wikiliveApi } from '../../../../shared/api/wikilive';
import { AiOutputView } from '../model/ai-output-renderer';
import { getEditorMarkdown } from '../model/editor-markdown';
import { useAiTableContext } from '../model/use-ai-table-context';

type CopilotTarget = 'table' | 'text';

type Anchor = {
  x: number;
  y: number;
  surfaceWidth?: number;
  target: CopilotTarget;
  datasheetId?: string | null;
  viewId?: string | null;
  tableSnapshot?: {
    datasheetId?: string;
    viewId?: string | null;
    fields?: Array<Record<string, unknown>>;
    records?: Array<Record<string, unknown>>;
    total?: number;
    updatedAt?: number;
  } | null;
};

type TableContext = {
  fields: MwsField[];
  records: MwsRecord[];
  total: number;
};

type WorkflowPlan = {
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
};

function dispatchTableMutation(detail: {
  datasheetId: string;
  op: 'create_records' | 'add_table_column' | 'refresh';
  records?: Array<{ recordId: string; fields: Record<string, unknown> }>;
  field?: MwsField;
}) {
  window.dispatchEvent(new CustomEvent('wikilive:ai-table-mutation', { detail }));
}

function isCopilotOpen(): boolean {
  const globalFlags = window as unknown as { __wikiliveCopilotOpen?: boolean };
  return Boolean(globalFlags.__wikiliveCopilotOpen);
}

function buildReportTitle(pageTitle?: string): string {
  if (pageTitle?.trim()) {
    return `AI-отчет: ${pageTitle.trim()}`;
  }

  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `AI-отчет ${stamp}`;
}

function isAnalysisPrompt(prompt: string): boolean {
  const value = prompt.toLowerCase();
  return /(анализ|обзор|что видно|покажи|сводк|summary|inspect|explain)/i.test(value);
}

function isTextLikeField(field: MwsField): boolean {
  const type = field.type.toLowerCase();
  return type.includes('text') || type.includes('string') || type.includes('single');
}

function parseColumnFromPrompt(prompt: string): { name: string; type: string } {
  const quoted = prompt.match(/["'«](.+?)["'»]/);
  const name = quoted?.[1]?.trim() || 'Новая колонка';
  const lower = prompt.toLowerCase();
  const type = lower.includes('числ') || lower.includes('population') || lower.includes('amount') || lower.includes('budget')
    ? 'Number'
    : 'SingleText';
  return { name, type };
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function parseRowRangeFromPrompt(prompt: string): { start: number; end: number } | null {
  const dashRange = prompt.match(/(?:строк[аи]?|rows?)\s*(\d{1,4})\s*[-–—]\s*(\d{1,4})/i);
  if (dashRange) {
    const start = Number(dashRange[1]);
    const end = Number(dashRange[2]);
    if (Number.isFinite(start) && Number.isFinite(end) && start > 0 && end >= start) {
      return { start, end };
    }
  }

  const fromToRange = prompt.match(/(?:строк[аи]?|rows?)\s*с\s*(\d{1,4})\s*по\s*(\d{1,4})/i);
  if (fromToRange) {
    const start = Number(fromToRange[1]);
    const end = Number(fromToRange[2]);
    if (Number.isFinite(start) && Number.isFinite(end) && start > 0 && end >= start) {
      return { start, end };
    }
  }

  return null;
}

function forceExistingRowsUpdate(
  prompt: string,
  plan: WorkflowPlan,
  existingRecords: MwsRecord[],
): WorkflowPlan {
  const range = parseRowRangeFromPrompt(prompt);
  if (!range) {
    return plan;
  }

  const hasExplicitUpdate = plan.commands.some((command) => command.type === 'UPDATE_RECORDS');
  if (hasExplicitUpdate) {
    return plan;
  }

  const addRows = plan.commands
    .filter((command): command is Extract<WorkflowPlan['commands'][number], { type: 'ADD_ROW' }> => command.type === 'ADD_ROW')
    .flatMap((command) => command.rows);

  if (addRows.length === 0) {
    return plan;
  }

  const startIndex = Math.max(0, range.start - 1);
  const endIndex = Math.min(existingRecords.length - 1, range.end - 1);
  const targetRecords = existingRecords.slice(startIndex, endIndex + 1);

  if (targetRecords.length === 0) {
    return plan;
  }

  const updateCount = Math.min(targetRecords.length, addRows.length);
  if (updateCount === 0) {
    return plan;
  }

  const updateRecords = Array.from({ length: updateCount }, (_, index) => ({
    recordId: targetRecords[index].recordId,
    fields: addRows[index].fields,
  }));

  const remainingRows = addRows.slice(updateCount);
  const passthroughCommands = plan.commands.filter((command) => command.type !== 'ADD_ROW');

  const nextCommands: WorkflowPlan['commands'] = [
    ...passthroughCommands,
    {
      type: 'UPDATE_RECORDS',
      records: updateRecords,
    },
  ];

  if (remainingRows.length > 0) {
    nextCommands.push({ type: 'ADD_ROW', rows: remainingRows });
  }

  return {
    summary: `${plan.summary} [auto-fix: existing rows ${range.start}-${range.end}]`,
    commands: nextCommands,
  };
}

function buildFieldLookup(fields: MwsField[]) {
  const byId = new Map<string, MwsField>();
  const byName = new Map<string, MwsField>();

  for (const field of fields) {
    byId.set(field.id, field);
    byName.set(normalizeText(field.name), field);
  }

  return { byId, byName };
}

export function AiInlineCopilot({
  enabled,
  isOpen,
  anchor,
  editor,
  spaceId,
  pageId,
  pageTitle,
  onClose,
}: {
  enabled: boolean;
  isOpen: boolean;
  anchor: Anchor | null;
  editor: Editor | null;
  spaceId: string;
  pageId: string | null;
  pageTitle?: string;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [showReportMenu, setShowReportMenu] = useState(false);
  const [createdPage, setCreatedPage] = useState<{ id: string; title: string } | null>(null);
  const { handleAiChatResponse, refreshTable: requestRefresh } = useAiTableContext();

  useEffect(() => {
    if (!isOpen) {
      setPrompt('');
      setOutput('');
      setStatus('');
      setShowReportMenu(false);
      setCreatedPage(null);
    }
  }, [isOpen]);

  const modeLabel = useMemo(() => {
    if (!anchor) {
      return '[Текст]';
    }

    return anchor.target === 'table'
      ? `[Таблица: ${anchor.datasheetId ?? 'unknown'}]`
      : '[Текст]';
  }, [anchor]);

  const position = useMemo(() => {
    if (!anchor) {
      return { left: 0, top: 0 };
    }

    const panelWidth = 560;
    const gap = 8;
    const margin = 8;
    const surfaceWidth = anchor.surfaceWidth ?? 1200;

    const preferRight = anchor.x + gap;
    const preferLeft = anchor.x - panelWidth - gap;
    const canOpenRight = preferRight + panelWidth <= surfaceWidth - margin;
    const canOpenLeft = preferLeft >= margin;

    let left = preferRight;
    if (!canOpenRight && canOpenLeft) {
      left = preferLeft;
    } else if (!canOpenRight && !canOpenLeft) {
      left = Math.min(Math.max(anchor.x + gap, margin), Math.max(margin, surfaceWidth - panelWidth - margin));
    }

    return {
      left,
      top: Math.max(8, anchor.y + 8),
    };
  }, [anchor]);

  if (!enabled || !isOpen || !anchor) {
    return null;
  }

  const withBusy = async <T,>(job: () => Promise<T>) => {
    setIsBusy(true);
    setStatus('Выполняю команду...');
    setCreatedPage(null);

    try {
      const result = await job();
      setStatus('Готово');
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка выполнения';
      setStatus(message);
      throw error;
    } finally {
      setIsBusy(false);
    }
  };

  const refreshTable = (datasheetId: string) => {
    dispatchTableMutation({ datasheetId, op: 'refresh' });
  };

  const getTableContext = async (datasheetId: string): Promise<TableContext> => {
    const snapshotFields = Array.isArray(anchor.tableSnapshot?.fields)
      ? (anchor.tableSnapshot.fields as MwsField[])
      : [];
    const snapshotRecords = Array.isArray(anchor.tableSnapshot?.records)
      ? (anchor.tableSnapshot.records as MwsRecord[])
      : [];

    if (snapshotFields.length > 0) {
      return {
        fields: snapshotFields,
        records: snapshotRecords,
        total: Number(anchor.tableSnapshot?.total ?? snapshotRecords.length),
      };
    }

    const [fieldsResponse, recordsResponse] = await Promise.all([
      wikiliveApi.listMwsFields(datasheetId, anchor.viewId ?? undefined),
      wikiliveApi.listMwsRecords(datasheetId, {
        viewId: anchor.viewId ?? undefined,
        pageSize: 50,
        pageNum: 1,
      }),
    ]);

    return {
      fields: fieldsResponse.items,
      records: recordsResponse.items,
      total: recordsResponse.total,
    };
  };

  const createRecords = async (datasheetId: string, records: Array<{ fields: Record<string, unknown> }>) => {
    const optimistic = records.map((row, index) => ({
      recordId: `temp-ai-${Date.now()}-${index}`,
      fields: row.fields,
    }));

    if (optimistic.length > 0) {
      dispatchTableMutation({
        datasheetId,
        op: 'create_records',
        records: optimistic,
      });
    }

    await wikiliveApi.createMwsRecords(datasheetId, {
      fieldKey: 'id',
      records,
    });
  };

  const updateRecords = async (
    datasheetId: string,
    records: Array<{ recordId: string; fields: Record<string, unknown> }>,
  ) => {
    if (records.length === 0) {
      return;
    }

    await wikiliveApi.updateMwsRecords(datasheetId, {
      fieldKey: 'id',
      records,
    });
  };

  const createColumn = async (
    datasheetId: string,
    column: { name: string; type: string; property?: Record<string, unknown> },
  ) => {
    const tempField: MwsField = {
      id: `temp-ai-field-${Date.now()}`,
      name: column.name,
      type: column.type,
      property: column.property,
    };

    dispatchTableMutation({
      datasheetId,
      op: 'add_table_column',
      field: tempField,
    });

    const response = await wikiliveApi.createMwsField(datasheetId, {
      spaceId,
      name: column.name,
      type: column.type,
      property: column.property,
    });

    return response.field;
  };

  const mapRowFieldsToIds = (rowFields: Record<string, unknown>, lookup: ReturnType<typeof buildFieldLookup>) => {
    const mapped: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(rowFields)) {
      const directField = lookup.byId.get(key);
      if (directField) {
        mapped[directField.id] = value;
        continue;
      }

      const byNameField = lookup.byName.get(normalizeText(key));
      if (byNameField) {
        mapped[byNameField.id] = value;
        continue;
      }

      mapped[key] = value;
    }

    return mapped;
  };

  const applyWorkflow = async (plan: WorkflowPlan, datasheetId: string) => {
    const context = await getTableContext(datasheetId);
    const lookup = buildFieldLookup(context.fields);
    const createdFields = new Map<string, MwsField>();

    for (const command of plan.commands) {
      if (command.type === 'ADD_COLUMN') {
        const nameKey = normalizeText(command.column.name);
        const existing = lookup.byName.get(nameKey);

        if (existing) {
          createdFields.set(nameKey, existing);
          continue;
        }

        const createdField = await createColumn(datasheetId, command.column);
        lookup.byId.set(createdField.id, createdField);
        lookup.byName.set(normalizeText(createdField.name), createdField);
        createdFields.set(nameKey, createdField);
        continue;
      }

      if (command.type === 'ADD_ROW') {
        const rows = command.rows.map((row) => ({
          fields: mapRowFieldsToIds(row.fields, lookup),
        }));

        if (rows.length > 0) {
          await createRecords(datasheetId, rows);
        }

        continue;
      }

      if (command.type === 'UPDATE_RECORDS') {
        const records = command.records.map((record) => ({
          recordId: record.recordId,
          fields: mapRowFieldsToIds(record.fields, lookup),
        }));

        if (records.length > 0) {
          await updateRecords(datasheetId, records);
        }
      }
    }

    refreshTable(datasheetId);
    return { createdFields, context };
  };

  const runTableWorkflow = async () => {
    const datasheetId = anchor.datasheetId;
    if (!datasheetId) {
      setStatus('Команда доступна только для таблицы');
      return;
    }

    await withBusy(async () => {
      const context = await getTableContext(datasheetId);
      const planned = await wikiliveApi.aiPlanWorkflow({
        prompt: prompt.trim(),
        spaceId,
        datasheetId,
        viewId: anchor.viewId ?? undefined,
        tableSnapshot: {
          datasheetId,
          viewId: anchor.viewId ?? undefined,
          fields: context.fields,
          records: context.records.map((record) => ({
            recordId: record.recordId,
            fields: record.fields,
          })),
          total: context.total,
          updatedAt: Date.now(),
        },
      });

      const normalizedPlan = forceExistingRowsUpdate(prompt.trim(), planned, context.records);

      setOutput(`AI план: ${normalizedPlan.summary}`);
      await applyWorkflow(normalizedPlan, datasheetId);
      requestRefresh({
        datasheetId,
        viewId: anchor.viewId ?? undefined,
      });
      setOutput(`${normalizedPlan.summary}\n\n${normalizedPlan.commands.map((command) => JSON.stringify(command)).join('\n')}`);
    });
  };

  const runAnalyze = async () => {
    await withBusy(async () => {
      if (anchor.target === 'table' && anchor.datasheetId) {
        const context = await getTableContext(anchor.datasheetId);
        const response = await wikiliveApi.aiChat({
          question: [
            'Ты анализируешь конкретную таблицу MWS.',
            `Вот ее данные JSON: ${JSON.stringify({ fields: context.fields, records: context.records.map((record) => ({ recordId: record.recordId, fields: record.fields })), total: context.total })}`,
            'Если данных таблицы недостаточно, первым делом вызови инструмент get_records.',
            'Сделай короткий анализ: тренды, аномалии, выводы.',
          ].join('\n'),
          pageId: pageId ?? undefined,
          datasheetId: anchor.datasheetId,
          viewId: anchor.viewId ?? undefined,
          pageTitle,
          pageSnapshot: {
            markdown: getEditorMarkdown(editor),
          },
        });

        handleAiChatResponse(response, {
          datasheetId: anchor.datasheetId,
          viewId: anchor.viewId ?? undefined,
        });

        const intro = `Вижу вашу таблицу с ${context.records.length} записями, готов анализировать...`;
        setOutput(`${intro}\n\n${response.answer}`);
        return;
      }

      const markdown = getEditorMarkdown(editor);
      const response = await wikiliveApi.aiChat({
        question: [
          'Ты помощник по тексту.',
          `Вот содержание документа: ${markdown}`,
          'Сделай краткий аналитический обзор и предложи улучшения.',
        ].join('\n'),
        pageId: pageId ?? undefined,
        pageTitle,
        pageSnapshot: { markdown },
      });

      handleAiChatResponse(response, {
        datasheetId: anchor.datasheetId,
        viewId: anchor.viewId ?? undefined,
      });

      setOutput(response.answer);
    });
  };

  const createReportText = async (): Promise<string> => {
    if (anchor.target === 'table' && anchor.datasheetId) {
      const context = await getTableContext(anchor.datasheetId);
      const response = await wikiliveApi.aiChat({
        question: [
          'Ты анализируешь конкретную таблицу MWS.',
          `Вот ее данные JSON: ${JSON.stringify({ fields: context.fields, records: context.records.map((record) => ({ recordId: record.recordId, fields: record.fields })), total: context.total })}`,
          'Если данных таблицы недостаточно, первым делом вызови инструмент get_records.',
          'Сгенерируй отчет в markdown формате.',
        ].join('\n'),
        pageId: pageId ?? undefined,
        datasheetId: anchor.datasheetId,
        viewId: anchor.viewId ?? undefined,
        pageTitle,
        pageSnapshot: {
          markdown: getEditorMarkdown(editor),
        },
      });

      handleAiChatResponse(response, {
        datasheetId: anchor.datasheetId,
        viewId: anchor.viewId ?? undefined,
      });

      return response.answer;
    }

    const markdown = getEditorMarkdown(editor);
    const response = await wikiliveApi.aiChat({
      question: [
        'Ты помощник по тексту.',
        `Вот содержание документа: ${markdown}`,
        `Запрос пользователя: ${prompt.trim() || 'Сформируй отчет по текущему документу.'}`,
      ].join('\n'),
      pageId: pageId ?? undefined,
      pageTitle,
      pageSnapshot: { markdown },
    });

    handleAiChatResponse(response, {
      datasheetId: anchor.datasheetId,
      viewId: anchor.viewId ?? undefined,
    });

    return response.answer;
  };

  const reportToCurrentFile = async () => {
    await withBusy(async () => {
      const reportText = await createReportText();
      if (editor) {
        editor.chain().focus().insertContent(`\n\n## AI отчет\n\n${reportText}\n`).run();
      }
      setOutput(reportText);
    });
  };

  const reportToNewFile = async () => {
    await withBusy(async () => {
      const reportText = await createReportText();
      const title = buildReportTitle(pageTitle);
      const created = await wikiliveApi.aiExecuteTool({
        toolName: 'create_wiki_page',
        args: {
          spaceId,
          title,
        },
        pageId: pageId ?? undefined,
        workspaceId: spaceId,
      });

      if (!created.ok) {
        throw new Error(created.error?.message ?? 'Не удалось создать страницу отчета');
      }

      const page = created.data?.page as { id?: string; title?: string } | undefined;
      const createdId = String(page?.id ?? '');
      if (!createdId) {
        throw new Error('Сервис не вернул id новой страницы');
      }

      setCreatedPage({ id: createdId, title: String(page?.title ?? title) });
      setOutput(reportText);
    });
  };

  const handleSend = async () => {
    if (isBusy) {
      return;
    }

    const trimmed = prompt.trim();
    if (!trimmed) {
      return;
    }

    if (anchor.target === 'table' && anchor.datasheetId) {
      if (isAnalysisPrompt(trimmed)) {
        await runAnalyze();
        return;
      }

      await runTableWorkflow();
      return;
    }

    await withBusy(async () => {
      const markdown = getEditorMarkdown(editor);
      const response = await wikiliveApi.aiChat({
        question: [
          'Ты помощник по тексту.',
          `Вот содержание документа: ${markdown}`,
          `Запрос пользователя: ${trimmed}`,
          'Верни только текст, который можно вставить в документ.',
        ].join('\n'),
        pageId: pageId ?? undefined,
        pageTitle,
        pageSnapshot: { markdown },
      });

      if (editor) {
        editor.commands.insertContent(response.answer);
      }

      handleAiChatResponse(response, {
        datasheetId: anchor.datasheetId,
        viewId: anchor.viewId ?? undefined,
      });

      setOutput(response.answer);
    });
  };

  return (
    <section
      className="absolute z-[80] w-[560px] max-w-[calc(100%-16px)] rounded-xl border border-editor-border-subtle bg-white p-3 shadow-2xl"
      style={{ left: `${position.left}px`, top: `${position.top}px` }}
      data-mws-stop-event="true"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-editor-text-primary">Inline AI Copilot</h3>
        <button
          type="button"
          className="rounded px-2 py-1 text-xs text-editor-text-tertiary hover:bg-editor-bg-control"
          onClick={onClose}
        >
          Закрыть
        </button>
      </div>

      <div className="mb-2 rounded-md border border-editor-border-subtle bg-[#fafbfd] px-2 py-1 text-xs text-editor-text-tertiary">
        Режим: {modeLabel}
      </div>

      <div className="mb-2 flex gap-2">
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Опишите, что нужно сделать с таблицей или текстом"
          className="min-h-[72px] w-full resize-y rounded-md border border-editor-border-subtle bg-white px-3 py-2 text-sm outline-none focus:border-[#5586ff]"
          disabled={isBusy}
        />
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center self-end rounded-md border border-editor-border-subtle bg-white text-editor-text-primary hover:bg-editor-bg-control disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => void handleSend()}
          disabled={isBusy || !prompt.trim()}
          title="Отправить"
        >
          <SendHorizontal size={14} />
        </button>
      </div>

      <div className="mb-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md border border-editor-border-subtle bg-white px-2 py-1 text-xs hover:bg-editor-bg-control disabled:opacity-50"
          onClick={() => void runAnalyze()}
          disabled={isBusy}
        >
          Анализ
        </button>

        <div className="relative">
          <button
            type="button"
            className="rounded-md border border-editor-border-subtle bg-white px-2 py-1 text-xs hover:bg-editor-bg-control disabled:opacity-50"
            onClick={() => setShowReportMenu((value) => !value)}
            disabled={isBusy}
          >
            Отчет
          </button>

          {showReportMenu ? (
            <div className="absolute left-0 top-8 z-[90] min-w-[180px] rounded-md border border-editor-border-subtle bg-white p-1 shadow-lg">
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-editor-bg-control"
                onClick={() => {
                  setShowReportMenu(false);
                  void reportToCurrentFile();
                }}
              >
                В этот файл
              </button>
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-editor-bg-control"
                onClick={() => {
                  setShowReportMenu(false);
                  void reportToNewFile();
                }}
              >
                В новый файл
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {status ? <p className="mb-2 text-xs text-editor-text-tertiary">{status}</p> : null}

      <div className="max-h-44 overflow-auto rounded-md border border-editor-border-subtle bg-[#fafbfd] p-2 text-xs text-editor-text-primary">
        {output ? <AiOutputView text={output} /> : <p>Ответ AI или статус выполнения появится здесь.</p>}
        {createdPage ? (
          <p className="mt-2">
            Создана страница:{' '}
            <a className="text-[#1f3fff] underline" href={`/spaces/${spaceId}/pages/${createdPage.id}`}>
              {createdPage.title}
            </a>
          </p>
        ) : null}
      </div>
    </section>
  );
}
