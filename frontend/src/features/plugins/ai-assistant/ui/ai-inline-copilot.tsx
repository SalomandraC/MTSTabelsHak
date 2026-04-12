import { useEffect, useMemo, useState } from 'react';
import type { Editor } from '@tiptap/core';

import { type AiExecuteToolResponse, type MwsField, wikiliveApi } from '../../../../shared/api/wikilive';
import { getEditorMarkdown } from '../model/editor-markdown';

type CopilotTarget = 'table' | 'text';

type PendingApplyAction = {
  label: string;
  toolName: 'create_records' | 'add_table_column';
  args: Record<string, unknown>;
};

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

function parseColumnName(prompt: string): string {
  const quoted = prompt.match(/["'«](.+?)["'»]/);
  if (quoted?.[1]?.trim()) {
    return quoted[1].trim();
  }

  const ru = prompt.match(/колонк(?:у|а)?\s+([\p{L}\p{N}\s_-]{2,})/iu);
  if (ru?.[1]?.trim()) {
    return ru[1].trim();
  }

  return 'Новая колонка';
}

function parseColumnType(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes('числ') || lower.includes('бюджет') || lower.includes('amount')) {
    return 'Number';
  }

  return 'SingleText';
}

function buildReportTitle(pageTitle?: string): string {
  if (pageTitle?.trim()) {
    return `AI-отчет: ${pageTitle.trim()}`;
  }

  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `AI-отчет ${stamp}`;
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
  const [pendingAction, setPendingAction] = useState<PendingApplyAction | null>(null);
  const [showReportMenu, setShowReportMenu] = useState(false);
  const [createdPage, setCreatedPage] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setPrompt('');
      setOutput('');
      setStatus('');
      setPendingAction(null);
      setShowReportMenu(false);
      setCreatedPage(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const position = useMemo(() => {
    if (!anchor) {
      return { left: 0, top: 0 };
    }

    const width = 520;
    const height = 300;
    const margin = 12;
    const left = Math.min(Math.max(anchor.x + 8, margin), window.innerWidth - width - margin);
    const top = Math.min(Math.max(anchor.y + 8, margin), window.innerHeight - height - margin);
    return { left, top };
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

  const runAnalyze = async () => {
    setPendingAction(null);

    if (anchor.target === 'table' && anchor.datasheetId) {
      const datasheetId = anchor.datasheetId;
      await withBusy(async () => {
        const records = Array.isArray(anchor.tableSnapshot?.records) ? anchor.tableSnapshot?.records ?? [] : [];
        const response = await wikiliveApi.aiChat({
          question: [
            'Ты анализируешь конкретную таблицу MWS.',
            `Вот ее данные JSON: ${JSON.stringify(anchor.tableSnapshot ?? { datasheetId: anchor.datasheetId })}`,
            'Используй инструменты get_records, create_records, add_table_column при необходимости.',
            'Дай краткий аналитический вывод: тренды, риски, аномалии.',
          ].join('\n'),
          pageId: pageId ?? undefined,
          datasheetId,
          viewId: anchor.viewId ?? undefined,
          pageTitle,
          pageSnapshot: {
            markdown: getEditorMarkdown(editor),
          },
        });

        const intro = `Вижу вашу таблицу с ${records.length} записями, готов анализировать...`;
        setOutput(`${intro}\n\n${response.answer}`);
        return response;
      });
      return;
    }

    await withBusy(async () => {
      const response = await wikiliveApi.aiChat({
        question: [
          'Ты помощник по тексту.',
          `Вот содержание документа: ${getEditorMarkdown(editor)}`,
          `Запрос пользователя: ${prompt.trim() || 'Напиши краткое дополнение к текущему документу.'}`,
          'Верни только готовый текст для вставки в документ.',
        ].join('\n'),
        pageId: pageId ?? undefined,
        pageTitle,
        pageSnapshot: {
          markdown: getEditorMarkdown(editor),
        },
      });

      if (editor) {
        editor.commands.insertContent(response.answer);
      }

      setOutput(response.answer);
      return response;
    });
  };

  const createReportText = async (): Promise<string> => {
    if (anchor.target === 'table' && anchor.datasheetId) {
      const result = await wikiliveApi.aiExecuteTool({
        toolName: 'analyze_table_data',
        args: {
          datasheetId: anchor.datasheetId,
          viewId: anchor.viewId ?? undefined,
          pageSize: 150,
          pageNum: 1,
        },
        pageId: pageId ?? undefined,
        workspaceId: spaceId,
      });

      if (!result.ok) {
        throw new Error(result.error?.message ?? 'Не удалось собрать данные для отчета');
      }

      return String(result.data?.markdown ?? 'Отчет пуст');
    }

    const response = await wikiliveApi.aiChat({
      question:
        prompt.trim() || 'Сформируй отчет по текущему документу: ключевые факты, выводы, рекомендации.',
      pageId: pageId ?? undefined,
      pageTitle,
      pageSnapshot: {
        markdown: getEditorMarkdown(editor),
      },
    });

    return response.answer;
  };

  const reportToCurrentFile = async () => {
    setPendingAction(null);
    await withBusy(async () => {
      const reportText = await createReportText();
      if (editor) {
        editor
          .chain()
          .focus()
          .insertContent(`\n\n## AI отчет\n\n${reportText}\n`)
          .run();
      }

      setOutput(reportText);
    });
  };

  const reportToNewFile = async () => {
    setPendingAction(null);
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

      if (editor) {
        editor
          .chain()
          .focus()
          .insertContent(`\n\n[AI отчет: ${title}](/spaces/${spaceId}/pages/${createdId})\n`)
          .run();
      }
    });
  };

  const prepareAddData = async () => {
    const datasheetId = anchor.datasheetId;
    if (!datasheetId) {
      setStatus('Команда доступна только для таблицы');
      return;
    }

    setPendingAction(null);
    await withBusy(async () => {
      const planned = await wikiliveApi.aiPlanMutation({
        operation: 'create_records',
        prompt: prompt.trim() || 'Добавь одну релевантную строку по контексту таблицы',
        spaceId,
        datasheetId,
        viewId: anchor.viewId ?? undefined,
        tableSnapshot: anchor.tableSnapshot ?? undefined,
      });

      setPendingAction({
        label: planned.summary,
        toolName: planned.toolName,
        args: planned.args,
      });
      setOutput(`AI подготовил команду: ${planned.summary}`);
      setStatus('Нажмите Применить');
    });
  };

  const prepareAddColumn = async () => {
    const datasheetId = anchor.datasheetId;
    if (!datasheetId) {
      setStatus('Команда доступна только для таблицы');
      return;
    }

    await withBusy(async () => {
      const planned = await wikiliveApi.aiPlanMutation({
        operation: 'add_table_column',
        prompt: prompt.trim() || `Добавь колонку ${parseColumnName(prompt)} типа ${parseColumnType(prompt)}`,
        spaceId,
        datasheetId,
        viewId: anchor.viewId ?? undefined,
        tableSnapshot: anchor.tableSnapshot ?? undefined,
      });

      setPendingAction({
        label: planned.summary,
        toolName: planned.toolName,
        args: planned.args,
      });
      setOutput(`AI подготовил команду: ${planned.summary}`);
      setStatus('Нажмите Применить');
    });
  };

  const applyPendingAction = async () => {
    if (!pendingAction) {
      return;
    }

    await withBusy(async () => {
      if (anchor.datasheetId && pendingAction.toolName === 'create_records') {
        const optimisticRecords = Array.isArray(pendingAction.args.records)
          ? pendingAction.args.records.map((item, index) => {
              const record = item as { fields?: Record<string, unknown> };
              return {
                recordId: `temp-ai-${Date.now()}-${index}`,
                fields: record.fields ?? {},
              };
            })
          : [];

        if (optimisticRecords.length > 0) {
          dispatchTableMutation({
            datasheetId: anchor.datasheetId,
            op: 'create_records',
            records: optimisticRecords,
          });
        }
      }

      if (anchor.datasheetId && pendingAction.toolName === 'add_table_column') {
        dispatchTableMutation({
          datasheetId: anchor.datasheetId,
          op: 'add_table_column',
          field: {
            id: `temp-ai-field-${Date.now()}`,
            name: String(pendingAction.args.name ?? 'Новая колонка'),
            type: String(pendingAction.args.type ?? 'SingleText'),
            property: (pendingAction.args.property as Record<string, unknown> | undefined) ?? undefined,
          },
        });
      }

      const result: AiExecuteToolResponse = await wikiliveApi.aiExecuteTool({
        toolName: pendingAction.toolName,
        args: pendingAction.args,
        pageId: pageId ?? undefined,
        workspaceId: spaceId,
      });

      if (!result.ok) {
        throw new Error(result.error?.message ?? 'Не удалось применить изменение');
      }

      if (anchor.datasheetId) {
        dispatchTableMutation({
          datasheetId: anchor.datasheetId,
          op: 'refresh',
        });
      }

      setOutput(`Изменение применено: ${pendingAction.label}`);
      setPendingAction(null);
    });
  };

  return (
    <section
      className="fixed z-[80] w-[520px] max-w-[calc(100vw-24px)] rounded-xl border border-editor-border-subtle bg-white p-3 shadow-2xl"
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
        Контекст: {anchor.target === 'table' ? `Таблица (${anchor.datasheetId ?? 'unknown'})` : 'Текст документа'}
      </div>

      <input
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Опишите задачу для AI"
        className="mb-2 h-9 w-full rounded-md border border-editor-border-subtle bg-white px-3 text-sm outline-none focus:border-[#5586ff]"
        disabled={isBusy}
      />

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
          onClick={() => void prepareAddData()}
          disabled={isBusy || anchor.target !== 'table'}
        >
          + Данные
        </button>

        <button
          type="button"
          className="rounded-md border border-editor-border-subtle bg-white px-2 py-1 text-xs hover:bg-editor-bg-control disabled:opacity-50"
          onClick={() => void prepareAddColumn()}
          disabled={isBusy || anchor.target !== 'table'}
        >
          + Колонка
        </button>

        {pendingAction ? (
          <button
            type="button"
            className="rounded-md bg-[#1f3fff] px-2 py-1 text-xs font-semibold text-white hover:bg-[#1732d2] disabled:opacity-50"
            onClick={() => void applyPendingAction()}
            disabled={isBusy}
          >
            Применить
          </button>
        ) : null}
      </div>

      {status ? <p className="mb-2 text-xs text-editor-text-tertiary">{status}</p> : null}
      {pendingAction ? <p className="mb-2 text-xs text-[#9a5b00]">Ожидает подтверждения: {pendingAction.label}</p> : null}

      <div className="max-h-40 overflow-auto rounded-md border border-editor-border-subtle bg-[#fafbfd] p-2 text-xs text-editor-text-primary">
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
