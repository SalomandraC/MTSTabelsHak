import { SendHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Editor } from '@tiptap/core';

import { type MwsField, wikiliveApi } from '../../../../shared/api/wikilive';
import { getEditorMarkdown } from '../model/editor-markdown';

type CopilotTarget = 'table' | 'text';

type Anchor = {
  x: number;
  y: number;
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

type AiMutationCommand =
  | {
      type: 'ADD_ROW';
      datasheetId: string;
      rows: Array<{ fields: Record<string, unknown> }>;
      summary?: string;
    }
  | {
      type: 'ADD_COLUMN';
      datasheetId: string;
      column: {
        name: string;
        type: string;
        property?: Record<string, unknown>;
      };
      summary?: string;
    }
  | {
      type: 'NONE';
      summary?: string;
    };

function dispatchTableMutation(detail: {
  datasheetId: string;
  op: 'create_records' | 'add_table_column' | 'refresh';
  records?: Array<{ recordId: string; fields: Record<string, unknown> }>;
  field?: MwsField;
}) {
  window.dispatchEvent(
    new CustomEvent('wikilive:ai-table-mutation', {
      detail,
    }),
  );
}

function inferMutationIntent(prompt: string): 'create_records' | 'add_table_column' | null {
  const value = prompt.toLowerCase();
  const asksColumn = /(колонк|столб|column)/i.test(value);
  if (asksColumn) {
    return 'add_table_column';
  }

  const asksRow = /(строк|запис|row|record|добав)/i.test(value);
  return asksRow ? 'create_records' : null;
}

function buildReportTitle(pageTitle?: string): string {
  if (pageTitle?.trim()) {
    return `AI-отчет: ${pageTitle.trim()}`;
  }

  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `AI-отчет ${stamp}`;
}

function buildCommandFromPlan(
  plan: { toolName: 'create_records' | 'add_table_column'; args: Record<string, unknown>; summary: string },
  fallbackDatasheetId: string,
): AiMutationCommand {
  if (plan.toolName === 'create_records') {
    return {
      type: 'ADD_ROW',
      datasheetId: String(plan.args.datasheetId ?? fallbackDatasheetId),
      rows: Array.isArray(plan.args.records)
        ? (plan.args.records as Array<{ fields?: Record<string, unknown> }>).map((item) => ({
            fields: item.fields ?? {},
          }))
        : [],
      summary: plan.summary,
    };
  }

  return {
    type: 'ADD_COLUMN',
    datasheetId: String(plan.args.datasheetId ?? fallbackDatasheetId),
    column: {
      name: String(plan.args.name ?? 'Новая колонка'),
      type: String(plan.args.type ?? 'SingleText'),
      property:
        plan.args.property && typeof plan.args.property === 'object'
          ? (plan.args.property as Record<string, unknown>)
          : undefined,
    },
    summary: plan.summary,
  };
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

    // Absolute positioning inside relative editor container.
    return {
      left: Math.max(8, anchor.x + 8),
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
    dispatchTableMutation({
      datasheetId,
      op: 'refresh',
    });
  };

  const applyAiMutation = async (command: AiMutationCommand) => {
    if (command.type === 'NONE') {
      setOutput(command.summary ?? 'Команда мутации не сгенерирована.');
      return;
    }

    if (command.type === 'ADD_ROW') {
      const optimistic = command.rows.map((row, index) => ({
        recordId: `temp-ai-${Date.now()}-${index}`,
        fields: row.fields,
      }));

      if (optimistic.length > 0) {
        dispatchTableMutation({
          datasheetId: command.datasheetId,
          op: 'create_records',
          records: optimistic,
        });
      }

      await wikiliveApi.aiExecuteTool({
        toolName: 'create_records',
        args: {
          datasheetId: command.datasheetId,
          fieldKey: 'id',
          records: command.rows,
        },
        pageId: pageId ?? undefined,
        workspaceId: spaceId,
      });

      refreshTable(command.datasheetId);
      return;
    }

    const tempField: MwsField = {
      id: `temp-ai-field-${Date.now()}`,
      name: command.column.name,
      type: command.column.type,
      property: command.column.property,
    };

    dispatchTableMutation({
      datasheetId: command.datasheetId,
      op: 'add_table_column',
      field: tempField,
    });

    await wikiliveApi.aiExecuteTool({
      toolName: 'add_table_column',
      args: {
        spaceId,
        datasheetId: command.datasheetId,
        name: command.column.name,
        type: command.column.type,
        property: command.column.property,
      },
      pageId: pageId ?? undefined,
      workspaceId: spaceId,
    });

    refreshTable(command.datasheetId);
  };

  const runAnalyze = async () => {
    await withBusy(async () => {
      if (anchor.target === 'table' && anchor.datasheetId) {
        const records = Array.isArray(anchor.tableSnapshot?.records) ? anchor.tableSnapshot.records : [];

        const response = await wikiliveApi.aiChat({
          question: [
            'Ты анализируешь конкретную таблицу MWS.',
            `Вот ее данные JSON: ${JSON.stringify(anchor.tableSnapshot ?? { datasheetId: anchor.datasheetId })}`,
            'Если данных таблицы недостаточно, первым делом вызови инструмент get_records.',
            'Используй инструменты get_records, create_records, add_table_column.',
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

        const intro = `Вижу вашу таблицу с ${records.length} записями, готов анализировать...`;
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

      setOutput(response.answer);
    });
  };

  const createReportText = async (): Promise<string> => {
    if (anchor.target === 'table' && anchor.datasheetId) {
      const response = await wikiliveApi.aiChat({
        question: [
          'Ты анализируешь конкретную таблицу MWS.',
          `Вот ее данные JSON: ${JSON.stringify(anchor.tableSnapshot ?? { datasheetId: anchor.datasheetId })}`,
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

  const runMutationFromPrompt = async (operation: 'create_records' | 'add_table_column') => {
    const datasheetId = anchor.datasheetId;
    if (!datasheetId) {
      setStatus('Команда доступна только для таблицы');
      return;
    }

    await withBusy(async () => {
      const planned = await wikiliveApi.aiPlanMutation({
        operation,
        prompt: prompt.trim() || (operation === 'create_records' ? 'Добавь одну релевантную строку' : 'Добавь новую колонку'),
        spaceId,
        datasheetId,
        viewId: anchor.viewId ?? undefined,
        tableSnapshot: anchor.tableSnapshot ?? undefined,
      });

      const command = buildCommandFromPlan(planned, datasheetId);
      setOutput(`SYNC COMMAND GENERATED: ${JSON.stringify(command, null, 2)}`);
      await applyAiMutation(command);
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
      const datasheetId = anchor.datasheetId;
      const mutationIntent = inferMutationIntent(trimmed);
      if (mutationIntent) {
        await runMutationFromPrompt(mutationIntent);
        return;
      }

      await withBusy(async () => {
        const response = await wikiliveApi.aiChat({
          question: [
            'Ты анализируешь конкретную таблицу MWS.',
            `Вот ее данные JSON: ${JSON.stringify(anchor.tableSnapshot ?? { datasheetId: anchor.datasheetId })}`,
            'Если ты не видишь данных таблицы, первым делом вызови инструмент get_records.',
            'Используй инструменты get_records, create_records, add_table_column.',
            `Запрос пользователя: ${trimmed}`,
          ].join('\n'),
          pageId: pageId ?? undefined,
          datasheetId,
          viewId: anchor.viewId ?? undefined,
          pageTitle,
          pageSnapshot: {
            markdown: getEditorMarkdown(editor),
          },
        });

        setOutput(response.answer);
      });

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
          placeholder="Опишите задачу для AI"
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

        <button
          type="button"
          className="rounded-md border border-editor-border-subtle bg-white px-2 py-1 text-xs hover:bg-editor-bg-control disabled:opacity-50"
          onClick={() => void runMutationFromPrompt('create_records')}
          disabled={isBusy || anchor.target !== 'table'}
        >
          + Данные
        </button>

        <button
          type="button"
          className="rounded-md border border-editor-border-subtle bg-white px-2 py-1 text-xs hover:bg-editor-bg-control disabled:opacity-50"
          onClick={() => void runMutationFromPrompt('add_table_column')}
          disabled={isBusy || anchor.target !== 'table'}
        >
          + Колонка
        </button>
      </div>

      {status ? <p className="mb-2 text-xs text-editor-text-tertiary">{status}</p> : null}

      <div className="max-h-44 overflow-auto rounded-md border border-editor-border-subtle bg-[#fafbfd] p-2 text-xs text-editor-text-primary">
        {output ? <pre className="whitespace-pre-wrap font-sans">{output}</pre> : <p>Ответ AI или статус выполнения появится здесь.</p>}
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
