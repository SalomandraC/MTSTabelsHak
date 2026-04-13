import { SendHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Editor } from '@tiptap/core';

import { type MwsField, type MwsRecord, wikiliveApi } from '../../../../shared/api/wikilive';
import { insertAiTextWithLiveReferences, parseMarkdownReportWithLiveReferences } from '../../../page-editor/model/live-reference-parser';
import { getEditorMarkdown } from '../model/editor-markdown';
import { AiOutputView } from '../model/ai-output-renderer';
import { useAiTableContext } from '../model/use-ai-table-context';

type CopilotTarget = 'table' | 'text';

type Anchor = {
  x: number;
  y: number;
  surfaceWidth?: number;
  surfaceHeight?: number;
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

type TableSnapshot = {
  datasheetId?: string;
  viewId?: string | null;
  fields?: Array<Record<string, unknown>>;
  records?: Array<Record<string, unknown>>;
  total?: number;
  updatedAt?: number;
};

type ContextOption = {
  id: string;
  label: string;
  kind: 'text' | 'table' | 'all';
  datasheetId?: string;
  viewId?: string;
};

type ActiveContext = {
  kind: 'text' | 'table' | 'all';
  datasheetId?: string;
  viewId?: string;
  tableSnapshot?: TableSnapshot | null;
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

type StructureInstruction = {
  anchor: string;
  title: string;
  level: 1 | 2 | 3;
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

function getStoredTableSnapshot(datasheetId?: string | null): TableSnapshot | null {
  if (!datasheetId) {
    return null;
  }

  const globalStore = window as unknown as {
    __wikiliveTableSnapshots?: Record<string, unknown>;
  };

  return (globalStore.__wikiliveTableSnapshots?.[datasheetId] ?? null) as TableSnapshot | null;
}

function collectTableOptions(editor: Editor | null): ContextOption[] {
  if (!editor?.state?.doc?.descendants) {
    return [];
  }

  const options: ContextOption[] = [];
  const seen = new Set<string>();

  editor.state.doc.descendants((node) => {
    if (node.type.name !== 'mwsTableEmbed') {
      return true;
    }

    const datasheetId = String(node.attrs?.datasheetId ?? '');
    if (!datasheetId || seen.has(datasheetId)) {
      return true;
    }

    seen.add(datasheetId);
    const viewId = typeof node.attrs?.viewId === 'string' ? String(node.attrs.viewId) : undefined;

    options.push({
      id: `table:${datasheetId}`,
      kind: 'table',
      datasheetId,
      viewId,
      label: `Таблица ${datasheetId.slice(0, 8)}${viewId ? ` · view ${viewId.slice(0, 6)}` : ''}`,
    });

    return true;
  });

  return options;
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

function stripMarkdownFence(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json|markdown)?\s*([\s\S]*?)\s*```$/i);

  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  return trimmed;
}

function stripLeadingHeadingNumbers(markdown: string): string {
  return markdown
    .replace(/^(#{1,6}\s+)(?:\d+(?:\.\d+)*[.)]?\s+)(.+)$/gm, '$1$2')
    .replace(/^(#{1,6}\s+)(?:\d+[.)]?\s+)(.+)$/gm, '$1$2');
}

function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[“”"'«»,.!?;:()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectStructureSourceBlocks(editor: Editor | null, limit = 40): Array<{ pos: number; text: string }> {
  if (!editor) {
    return [];
  }

  const { from, to, empty } = editor.state.selection;

  if (!empty) {
    const text = editor.state.doc.textBetween(from, to, '\n', '\n').trim();
    return text ? [{ pos: from, text }] : [];
  }

  const blocks: Array<{ pos: number; text: string }> = [];

  editor.state.doc.descendants((node, pos) => {
    if (blocks.length >= limit) {
      return false;
    }

    if (!node.isTextblock || node.type.name === 'heading') {
      return true;
    }

    const text = node.textContent.trim();
    if (!text) {
      return true;
    }

    blocks.push({ pos, text });
    return true;
  });

  return blocks;
}

function parseStructureInstructions(answer: string): StructureInstruction[] {
  const candidate = stripMarkdownFence(answer);

  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const record = item as Record<string, unknown>;
        const anchor = typeof record.anchor === 'string' ? record.anchor.trim() : '';
        const title = typeof record.title === 'string' ? record.title.trim() : '';
        const level = Number(record.level);

        if (!anchor || !title || ![1, 2, 3].includes(level)) {
          return null;
        }

        return {
          anchor,
          title,
          level: level as 1 | 2 | 3,
        } satisfies StructureInstruction;
      })
      .filter((item): item is StructureInstruction => Boolean(item));
  } catch {
    return [];
  }
}

function findAnchorPosition(editor: Editor, anchor: string): number | null {
  const normalizedAnchor = normalizeSearchText(anchor);
  if (!normalizedAnchor) {
    return null;
  }

  const anchorPrefix = normalizedAnchor.split(' ').slice(0, 7).join(' ');
  let foundPos: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (!node.isTextblock || node.type.name === 'heading') {
      return true;
    }

    const normalizedText = normalizeSearchText(node.textContent);
    if (!normalizedText) {
      return true;
    }

    if (normalizedText.startsWith(anchorPrefix) || normalizedText.includes(normalizedAnchor)) {
      foundPos = pos;
      return false;
    }

    return true;
  });

  return foundPos;
}

function findTableRootBlockInsertPos(editor: Editor, datasheetId?: string | null): number | null {
  if (!datasheetId) {
    return null;
  }

  let tablePos: number | null = null;
  let tableRootBlockDepth: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'mwsTableEmbed') {
      return true;
    }

    if (String(node.attrs?.datasheetId ?? '') !== datasheetId) {
      return true;
    }

    const resolved = editor.state.doc.resolve(pos);
    for (let depth = resolved.depth; depth >= 0; depth -= 1) {
      if (resolved.node(depth).type.name === 'rootblock') {
        tablePos = pos;
        tableRootBlockDepth = depth;
        return false;
      }
    }

    return true;
  });

  if (tablePos === null || tableRootBlockDepth === null) {
    return null;
  }

  const resolved = editor.state.doc.resolve(tablePos);
  return resolved.after(tableRootBlockDepth);
}

function buildReportRootBlock(reportText: string, spaceId: string) {
  return {
    type: 'rootblock',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'AI отчет' }],
      },
      ...parseMarkdownReportWithLiveReferences(reportText, { spaceId }),
    ],
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
  isPageNavigationEnabled,
  isDocumentStructureEnabled,
  onClose,
}: {
  enabled: boolean;
  isOpen: boolean;
  anchor: Anchor | null;
  editor: Editor | null;
  spaceId: string;
  pageId: string | null;
  pageTitle?: string;
  isPageNavigationEnabled: boolean;
  isDocumentStructureEnabled: boolean;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [output, setOutput] = useState('');
  const [structurePlan, setStructurePlan] = useState<StructureInstruction[]>([]);
  const [status, setStatus] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [showReportMenu, setShowReportMenu] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [createdPage, setCreatedPage] = useState<{ id: string; title: string } | null>(null);
  const [selectedContextId, setSelectedContextId] = useState('detected');
  const { handleAiChatResponse, refreshTable: requestRefresh } = useAiTableContext();

  useEffect(() => {
    if (!isOpen) {
      setPrompt('');
      setOutput('');
      setStructurePlan([]);
      setStatus('');
      setShowReportMenu(false);
      setShowContextMenu(false);
      setCreatedPage(null);
      setSelectedContextId('detected');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (showContextMenu) {
        setShowContextMenu(false);
        return;
      }

      if (showReportMenu) {
        setShowReportMenu(false);
        return;
      }

      onClose();
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, showContextMenu, showReportMenu]);

  const contextOptions = useMemo(() => {
    const options: ContextOption[] = [
      { id: 'text', kind: 'text', label: 'Текст страницы' },
      ...collectTableOptions(editor),
      { id: 'all', kind: 'all', label: 'Всё (весь документ + все таблицы)' },
    ];

    return options;
  }, [editor]);

  useEffect(() => {
    if (selectedContextId !== 'detected' && !contextOptions.some((option) => option.id === selectedContextId)) {
      setSelectedContextId('detected');
    }
  }, [contextOptions, selectedContextId]);

  const activeContext = useMemo<ActiveContext>(() => {
    if (selectedContextId === 'detected') {
      if (anchor?.target === 'table' && anchor.datasheetId) {
        return {
          kind: 'table',
          datasheetId: anchor.datasheetId,
          viewId: anchor.viewId ?? undefined,
          tableSnapshot: anchor.tableSnapshot ?? getStoredTableSnapshot(anchor.datasheetId),
        };
      }

      return { kind: 'text' };
    }

    const selected = contextOptions.find((option) => option.id === selectedContextId);

    if (!selected) {
      return { kind: 'text' };
    }

    if (selected.kind === 'text') {
      return { kind: 'text' };
    }

    if (selected.kind === 'all') {
      return { kind: 'all' };
    }

    return {
      kind: 'table',
      datasheetId: selected.datasheetId,
      viewId: selected.viewId,
      tableSnapshot: getStoredTableSnapshot(selected.datasheetId),
    };
  }, [anchor, contextOptions, selectedContextId]);

  const modeLabel = useMemo(() => {
    if (activeContext.kind === 'all') {
      return '[Всё: документ + таблицы]';
    }

    if (activeContext.kind === 'table') {
      return `[Таблица: ${activeContext.datasheetId ?? 'unknown'}]`;
    }

    return '[Текст]';
  }, [activeContext]);

  const hasManualContext = selectedContextId !== 'detected';

  const position = useMemo(() => {
    if (!anchor) {
      return { left: 0, top: 0 };
    }

    const panelWidth = 560;
    const panelHeight = 360;
    const gap = 8;
    const margin = 8;
    const surfaceWidth = anchor.surfaceWidth ?? 1200;
    const surfaceHeight = anchor.surfaceHeight ?? window.innerHeight;

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

    const top = anchor.y + gap;

    return {
      left,
      top,
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

  const getTableContext = async (input: {
    datasheetId: string;
    viewId?: string;
    tableSnapshot?: TableSnapshot | null;
  }): Promise<TableContext> => {
    const snapshotFields = Array.isArray(input.tableSnapshot?.fields)
      ? (input.tableSnapshot.fields as MwsField[])
      : [];
    const snapshotRecords = Array.isArray(input.tableSnapshot?.records)
      ? (input.tableSnapshot.records as MwsRecord[])
      : [];

    if (snapshotFields.length > 0) {
      return {
        fields: snapshotFields,
        records: snapshotRecords,
        total: Number(input.tableSnapshot?.total ?? snapshotRecords.length),
      };
    }

    const [fieldsResponse, recordsResponse] = await Promise.all([
      wikiliveApi.listMwsFields(input.datasheetId, input.viewId ?? undefined),
      wikiliveApi.listMwsRecords(input.datasheetId, {
        viewId: input.viewId ?? undefined,
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
    const context = await getTableContext({
      datasheetId,
      viewId: activeContext.viewId,
      tableSnapshot: activeContext.tableSnapshot,
    });
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
    const datasheetId = activeContext.kind === 'table' ? activeContext.datasheetId : undefined;
    if (!datasheetId) {
      setStatus('Команда доступна только для таблицы');
      return;
    }

    await withBusy(async () => {
      const context = await getTableContext({
        datasheetId,
        viewId: activeContext.viewId,
        tableSnapshot: activeContext.tableSnapshot,
      });
      const planned = await wikiliveApi.aiPlanWorkflow({
        prompt: prompt.trim(),
        spaceId,
        datasheetId,
        viewId: activeContext.viewId,
        tableSnapshot: {
          datasheetId,
          viewId: activeContext.viewId,
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
        viewId: activeContext.viewId,
      });
      setOutput(`${normalizedPlan.summary}\n\n${normalizedPlan.commands.map((command) => JSON.stringify(command)).join('\n')}`);
    });
  };

  const buildAllTablesContextPayload = async () => {
    const tableOptions = contextOptions.filter((option) => option.kind === 'table');
    const payload: Array<Record<string, unknown>> = [];

    for (const option of tableOptions) {
      const datasheetId = option.datasheetId;
      if (!datasheetId) {
        continue;
      }

      const context = await getTableContext({
        datasheetId,
        viewId: option.viewId,
        tableSnapshot: getStoredTableSnapshot(datasheetId),
      });

      payload.push({
        datasheetId,
        viewId: option.viewId ?? null,
        fields: context.fields,
        records: context.records.slice(0, 50).map((record) => ({
          recordId: record.recordId,
          fields: record.fields,
        })),
        total: context.total,
      });
    }

    return payload;
  };

  const runAnalyze = async () => {
    await withBusy(async () => {
      if (activeContext.kind === 'table' && activeContext.datasheetId) {
        const context = await getTableContext({
          datasheetId: activeContext.datasheetId,
          viewId: activeContext.viewId,
          tableSnapshot: activeContext.tableSnapshot,
        });
        const response = await wikiliveApi.aiChat({
          question: [
            'Ты анализируешь конкретную таблицу MWS.',
            `Вот ее данные JSON: ${JSON.stringify({ fields: context.fields, records: context.records.map((record) => ({ recordId: record.recordId, fields: record.fields })), total: context.total })}`,
            'Если данных таблицы недостаточно, первым делом вызови инструмент get_records.',
            'Сделай короткий анализ: тренды, аномалии, выводы.',
          ].join('\n'),
          pageId: pageId ?? undefined,
          datasheetId: activeContext.datasheetId,
          viewId: activeContext.viewId,
          pageTitle,
          pageSnapshot: {
            markdown: getEditorMarkdown(editor),
          },
        });

        handleAiChatResponse(response, {
          datasheetId: activeContext.datasheetId,
          viewId: activeContext.viewId,
        });

        const intro = `Вижу вашу таблицу с ${context.records.length} записями, готов анализировать...`;
        setOutput(`${intro}\n\n${response.answer}`);
        return;
      }

      if (activeContext.kind === 'all') {
        const markdown = getEditorMarkdown(editor);
        const tables = await buildAllTablesContextPayload();
        const response = await wikiliveApi.aiChat({
          question: [
            'Ты помощник по общему анализу документа и всех таблиц на странице.',
            `Содержание документа: ${markdown}`,
            `Таблицы JSON: ${JSON.stringify(tables)}`,
            'Сделай целостный анализ с общими выводами.',
          ].join('\n'),
          pageId: pageId ?? undefined,
          pageTitle,
          pageSnapshot: { markdown },
        });

        handleAiChatResponse(response);
        setOutput(response.answer);
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

      handleAiChatResponse(response);

      setOutput(response.answer);
    });
  };

  const createReportText = async (): Promise<string> => {
    if (activeContext.kind === 'table' && activeContext.datasheetId) {
      const context = await getTableContext({
        datasheetId: activeContext.datasheetId,
        viewId: activeContext.viewId,
        tableSnapshot: activeContext.tableSnapshot,
      });
      const response = await wikiliveApi.aiChat({
        question: [
          'Ты анализируешь конкретную таблицу MWS и пишешь отчет на основе ее данных.',
          `Вот ее данные JSON: ${JSON.stringify({ fields: context.fields, records: context.records.map((record) => ({ recordId: record.recordId, fields: record.fields })), total: context.total })}`,
          'Если данных таблицы недостаточно, первым делом вызови инструмент get_records.',
          'Сгенерируй отчет в markdown формате, но без markdown-таблиц.',
          'Используй только текст, заголовки, абзацы и маркированные списки.',
          'Когда в отчете упоминаешь конкретную ячейку таблицы, обязательно вставляй живую переменную в формате [Ref:datasheetId:recordId:fieldId].',
          'Используй живые переменные для ключевых метрик, статусов, дат и значений, которые должны обновляться вместе с таблицей.',
        ].join('\n'),
        pageId: pageId ?? undefined,
        datasheetId: activeContext.datasheetId,
        viewId: activeContext.viewId,
        pageTitle,
        pageSnapshot: {
          markdown: getEditorMarkdown(editor),
        },
      });

      handleAiChatResponse(response, {
        datasheetId: activeContext.datasheetId,
        viewId: activeContext.viewId,
      });

      return response.answer;
    }

    if (activeContext.kind === 'all') {
      const markdown = getEditorMarkdown(editor);
      const tables = await buildAllTablesContextPayload();
      const response = await wikiliveApi.aiChat({
        question: [
          'Сформируй общий отчет по документу и всем таблицам на странице.',
          `Содержание документа: ${markdown}`,
          `Таблицы JSON: ${JSON.stringify(tables)}`,
          `Дополнительный запрос: ${prompt.trim() || 'Сформируй общий аналитический отчет.'}`,
        ].join('\n'),
        pageId: pageId ?? undefined,
        pageTitle,
        pageSnapshot: { markdown },
      });

      handleAiChatResponse(response);
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

    handleAiChatResponse(response);

    return response.answer;
  };

  const reportToCurrentFile = async () => {
    await withBusy(async () => {
      const reportText = await createReportText();
      if (editor) {
        const reportRootBlock = buildReportRootBlock(reportText, spaceId);
        const insertPos = activeContext.kind === 'table' && activeContext.datasheetId
          ? findTableRootBlockInsertPos(editor, activeContext.datasheetId)
          : null;

        if (insertPos !== null) {
          editor.chain().focus().insertContentAt(insertPos, reportRootBlock).run();
        } else {
          const endPosition = editor.state.doc.content.size;
          editor.chain().focus().insertContentAt(endPosition, reportRootBlock).run();
        }
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

    if (activeContext.kind === 'table' && activeContext.datasheetId) {
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
          'Если нужно сослаться на конкретную ячейку MWS, используй токен в формате [Ref:tableId:rowId:colId].',
          'Верни только текст, который можно вставить в документ.',
        ].join('\n'),
        pageId: pageId ?? undefined,
        pageTitle,
        pageSnapshot: { markdown },
      });

      if (editor) {
        insertAiTextWithLiveReferences(editor, response.answer);
      }

      handleAiChatResponse(response);

      setOutput(response.answer);
    });
  };

  const handleStructureDocument = async () => {
    await withBusy(async () => {
      const sourceBlocks = collectStructureSourceBlocks(editor);
      const sourceText = sourceBlocks.map((block) => block.text).join('\n\n') || getEditorMarkdown(editor);
      const request = prompt.trim();
      const wantsNoNumbers = /(без\s+нумерац|without\s+number)/i.test(request);
      const response = await wikiliveApi.aiChat({
        question: [
          'Ты — аналитик структуры документа. Твоя задача — изучить текст и составить список мест, где нужно вставить заголовки.',
          'НЕ ВОЗВРАЩАЙ ВЕСЬ ТЕКСТ ДОКУМЕНТА.',
          'Верни ответ ТОЛЬКО в формате JSON-массива объектов:',
          '[{"anchor": "фраза из начала абзаца", "title": "Текст заголовка", "level": 1|2|3}]',
          'Правила:',
          'anchor — это первые 5-7 слов абзаца, перед которым нужно поставить заголовок.',
          'title — это текст заголовка, который ты придумал. НЕ добавляй в него цифры (1., 1.1.), система сделает это сама.',
          'Плотность заголовков может отличаться по частям документа.',
          'Если пользователь просит для одной части редкую структуру, а для другой частую, следуй этому буквально:',
          '- редкая: только крупные разделы;',
          '- частая: более детальные подзаголовки и дробление больших блоков.',
          wantsNoNumbers
            ? 'Если пользователь просит без нумерации, просто делай заголовки.'
            : 'По умолчанию используй заголовки без цифр. Нумерация, если она нужна, будет добавлена системой автоматически.',
          'Если в тексте уже есть заголовки, возвращай только новые места для вставки.',
          request ? `Дополнительный запрос пользователя: ${request}` : '',
          sourceBlocks.length > 0
            ? `Абзацы для анализа:\n${sourceBlocks
                .map((block, index) => `${index + 1}. ${block.text.slice(0, 220)}`)
                .join('\n\n')}`
            : `Текст для анализа:\n${sourceText}`,
        ].join('\n'),
        pageId: pageId ?? undefined,
        pageTitle,
        pageSnapshot: { markdown: sourceText },
      });

      handleAiChatResponse(response);

      if (editor) {
        const plan = parseStructureInstructions(response.answer);
        setStructurePlan(plan);
        setOutput(JSON.stringify(plan, null, 2));
        return;
      }

      const plan = parseStructureInstructions(response.answer);
      setStructurePlan(plan);
      setOutput(JSON.stringify(plan, null, 2));
    });
  };

  const handleApplyStructureDraft = () => {
    if (!editor || structurePlan.length === 0) {
      return;
    }

    const insertions = structurePlan
      .map((instruction, index) => ({
        instruction,
        index,
        pos: findAnchorPosition(editor, instruction.anchor),
      }))
      .filter((item): item is { instruction: StructureInstruction; index: number; pos: number } => typeof item.pos === 'number')
      .sort((left, right) => right.pos - left.pos || left.index - right.index);

    for (const item of insertions) {
      editor.commands.insertContentAt(item.pos, {
        type: 'heading',
        attrs: { level: item.instruction.level },
        content: [{ type: 'text', text: stripLeadingHeadingNumbers(item.instruction.title) }],
      });
    }

    editor.view.dispatch(editor.state.tr);
    setStatus(`Вставлено заголовков: ${insertions.length}`);
    setStructurePlan([]);
  };

  return (
    <section
      className="absolute z-[80] w-[560px] max-w-[calc(100%-16px)] rounded-2xl border border-[#ffd9e1] bg-white p-3 shadow-[0_14px_34px_rgba(215,0,50,0.09)]"
      style={{ left: `${position.left}px`, top: `${position.top}px` }}
      data-mws-stop-event="true"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#d70032]">MWS COPILOT</h3>
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-editor-border-subtle text-editor-text-tertiary hover:bg-editor-bg-control"
          onClick={onClose}
          aria-label="Закрыть MWS COPILOT"
          title="Закрыть"
        >
          <X size={14} />
        </button>
      </div>

      <div className="relative mb-2">
        <button
          type="button"
          onClick={() => setShowContextMenu((value) => !value)}
          disabled={isBusy}
          className="w-full rounded-md border border-[#ffd9e1] bg-[#fff7f8] px-2 py-1 text-left text-xs text-[#6d7280] hover:bg-[#fff1f3] disabled:opacity-50"
        >
          Режим: {modeLabel}{hasManualContext ? ' · выбран вручную' : ''}
        </button>

        {showContextMenu ? (
          <div className="absolute left-0 right-0 top-9 z-[90] rounded-md border border-[#ffd9e1] bg-white p-1 shadow-[0_8px_20px_rgba(215,0,50,0.08)]">
            {contextOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-editor-bg-control"
                onClick={() => {
                  setSelectedContextId(option.id);
                  setShowContextMenu(false);
                }}
              >
                {option.label}
              </button>
            ))}

            {hasManualContext ? (
              <button
                type="button"
                className="mt-1 block w-full rounded border border-editor-border-subtle px-2 py-1 text-left text-xs text-editor-text-tertiary hover:bg-editor-bg-control"
                onClick={() => {
                  setSelectedContextId('detected');
                  setShowContextMenu(false);
                }}
              >
                Вернуться к определению по месту
              </button>
            ) : null}
          </div>
        ) : null}
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
          className="min-h-[72px] w-full resize-y rounded-md border border-editor-border-subtle bg-white px-3 py-2 text-sm outline-none focus:border-[#d70032]"
          disabled={isBusy}
        />
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center self-end rounded-md border border-[#d70032] bg-[#d70032] text-white hover:bg-[#b8002b] disabled:cursor-not-allowed disabled:opacity-50"
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
          className="rounded-md border border-[#ffd9e1] bg-white px-2 py-1 text-xs text-[#5a6170] hover:bg-[#fff1f3] disabled:opacity-50"
          onClick={() => void runAnalyze()}
          disabled={isBusy}
        >
          Анализ
        </button>

        {isDocumentStructureEnabled ? (
          <button
            type="button"
            className="rounded-md border border-[#ffd9e1] bg-white px-2 py-1 text-xs text-[#5a6170] hover:bg-[#fff1f3] disabled:opacity-50"
            onClick={() => {
              setStructurePlan([]);
              void handleStructureDocument();
            }}
            disabled={isBusy}
          >
            Структурировать
          </button>
        ) : null}

        <div className="relative">
          <button
            type="button"
            className="rounded-md border border-[#ffd9e1] bg-white px-2 py-1 text-xs text-[#5a6170] hover:bg-[#fff1f3] disabled:opacity-50"
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
        {structurePlan.length > 0 ? (
          <div className="space-y-2">
            <p className="font-semibold">Я расставлю {structurePlan.length} заголовков:</p>
            <ol className="space-y-2 pl-4">
              {structurePlan.map((item, index) => (
                <li key={`${item.anchor}-${index}`} className="list-decimal">
                  <span className="font-semibold">[{item.title}]</span>{' '}
                  перед текстом &quot;{item.anchor.slice(0, 72)}{item.anchor.length > 72 ? '…' : ''}&quot;
                </li>
              ))}
            </ol>
          </div>
        ) : output ? (
          <AiOutputView text={output} />
        ) : (
          <p>Ответ MWS COPILOT или статус выполнения появится здесь.</p>
        )}
        {structurePlan.length > 0 ? (
          <button
            type="button"
            onClick={handleApplyStructureDraft}
            className="mt-3 w-full rounded-md border border-[#ffd7a8] bg-[#fff5e8] px-3 py-2 text-sm font-semibold text-[#7d4a00] transition-colors hover:bg-[#ffebd1]"
          >
            ⚡️ Применить
          </button>
        ) : null}
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
