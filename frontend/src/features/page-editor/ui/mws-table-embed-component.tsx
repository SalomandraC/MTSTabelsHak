import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import {
  Columns3,
  ExternalLink,
  EyeOff,
  Filter,
  Group,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Search,
  Settings,
  SortAsc,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { type MwsField, type MwsRecord, type ResolveTableEmbedResponse, wikiliveApi } from '../../../shared/api/wikilive';

const EDITABLE_FIELD_TYPES = new Set([
  'SingleText',
  'Text',
  'Number',
  'Currency',
  'Percent',
  'Checkbox',
  'DateTime',
  'URL',
  'Email',
  'Phone',
]);

const HEADER_HEIGHT = 40;
const ROW_HEIGHT = 38;
const INDEX_WIDTH = 56;
const COLUMN_WIDTH = 184;
const MIN_GRID_HEIGHT = 320;
const MAX_GRID_HEIGHT = 520;

type CanvasSelection = {
  rowIndex: number;
  fieldIndex: number;
};

type EditingCell = CanvasSelection & {
  left: number;
  top: number;
  width: number;
  height: number;
  value: string;
};

function renderCell(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(renderCell).join(', ');
  }

  return JSON.stringify(value);
}

function getFieldValue(record: MwsRecord, field: MwsField) {
  return record.fields[field.id] ?? record.fields[field.name];
}

function parseEditedValue(field: MwsField, value: string | boolean) {
  if (field.type === 'Checkbox') {
    return Boolean(value);
  }

  if (['Number', 'Currency', 'Percent'].includes(field.type)) {
    return value === '' ? null : Number(value);
  }

  return String(value);
}

function fieldInputType(field: MwsField) {
  if (['Number', 'Currency', 'Percent'].includes(field.type)) {
    return 'number';
  }

  if (field.type === 'DateTime') {
    return 'datetime-local';
  }

  if (field.type === 'Email') {
    return 'email';
  }

  if (field.type === 'URL') {
    return 'url';
  }

  if (field.type === 'Phone') {
    return 'tel';
  }

  return 'text';
}

function clampText(ctx: CanvasRenderingContext2D, value: string, maxWidth: number) {
  if (ctx.measureText(value).width <= maxWidth) {
    return value;
  }

  let next = value;
  while (next.length > 1 && ctx.measureText(`${next}...`).width > maxWidth) {
    next = next.slice(0, -1);
  }

  return `${next}...`;
}

function ToolbarButton({
  label,
  icon,
  onClick,
  disabled = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm text-[#3f3f46] transition-colors hover:bg-[#edf0f5] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function MwsTableEmbedComponent({ node, selected }: NodeViewProps) {
  const [data, setData] = useState<ResolveTableEmbedResponse | null>(null);
  const [records, setRecords] = useState<MwsRecord[]>([]);
  const [pageNum, setPageNum] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [staleMessage, setStaleMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewport, setViewport] = useState({ width: 720, height: MIN_GRID_HEIGHT });
  const [scrollOffset, setScrollOffset] = useState({ left: 0, top: 0 });
  const [selection, setSelection] = useState<CanvasSelection | null>(null);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hasLoadedDataRef = useRef(false);

  const attrs = node.attrs as {
    spaceId?: string;
    nodeId?: string;
    datasheetId?: string;
    viewId?: string | null;
    displayMode?: string;
    selectedFieldIds?: string[];
    filterByFormula?: string | null;
    pageSize?: number;
    allowInlineEdit?: boolean;
  };

  const selectedFieldKey = (attrs.selectedFieldIds ?? []).join(',');
  const selectedFieldIds = useMemo(() => (selectedFieldKey ? selectedFieldKey.split(',') : []), [selectedFieldKey]);
  const pageSize = attrs.pageSize ?? 50;

  const loadEmbed = useCallback(async () => {
    if (!attrs.spaceId || !attrs.nodeId || !attrs.datasheetId) {
      setErrorMessage('В embed не хватает идентификаторов MWS Tables');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setErrorMessage('');
      const response = await wikiliveApi.resolveTableEmbed({
        spaceId: attrs.spaceId,
        nodeId: attrs.nodeId,
        datasheetId: attrs.datasheetId,
        viewId: attrs.viewId,
        displayMode: attrs.displayMode ?? 'table',
        selectedFieldIds,
        filterByFormula: attrs.filterByFormula,
        pageSize,
        allowInlineEdit: attrs.allowInlineEdit ?? false,
      });

      setData(response);
      setRecords(response.embed.preview.items);
      setPageNum(response.embed.preview.pageNum);
      setTotal(response.embed.total ?? response.embed.preview.total);
      setSelection(null);
      setEditingCell(null);
      setStaleMessage('');
      hasLoadedDataRef.current = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось загрузить MWS Tables embed';
      if (hasLoadedDataRef.current) {
        setStaleMessage(message);
      } else {
        setErrorMessage(message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    attrs.allowInlineEdit,
    attrs.datasheetId,
    attrs.displayMode,
    attrs.filterByFormula,
    attrs.nodeId,
    attrs.spaceId,
    attrs.viewId,
    pageSize,
    selectedFieldIds,
  ]);

  useEffect(() => {
    void loadEmbed();
  }, [loadEmbed]);

  const embed = data?.embed;
  const fields = useMemo(() => embed?.fields ?? [], [embed?.fields]);
  const capabilities = embed?.capabilities ?? {};
  const canInlineEdit = Boolean(attrs.allowInlineEdit && capabilities.canInlineEdit);
  const hasMore = records.length < total;
  const gridWidth = INDEX_WIDTH + fields.length * COLUMN_WIDTH;

  const visibleRecords = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();
    if (!normalized) {
      return records;
    }

    return records.filter((record) =>
      fields.some((field) => renderCell(getFieldValue(record, field)).toLowerCase().includes(normalized)),
    );
  }, [fields, records, searchQuery]);

  const gridHeight = HEADER_HEIGHT + Math.max(visibleRecords.length, 1) * ROW_HEIGHT;
  const selectedRecord = selection ? visibleRecords[selection.rowIndex] : null;

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return undefined;
    }

    const updateViewport = () => {
      setViewport({
        width: Math.max(1, element.clientWidth),
        height: Math.max(1, element.clientHeight),
      });
    };

    updateViewport();
    const observer = new ResizeObserver(updateViewport);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, viewport.width);
    const height = Math.max(1, viewport.height);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 1;

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, HEADER_HEIGHT);
    ctx.strokeStyle = '#dde2ea';
    ctx.beginPath();
    ctx.moveTo(0, HEADER_HEIGHT - 0.5);
    ctx.lineTo(width, HEADER_HEIGHT - 0.5);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, HEADER_HEIGHT, INDEX_WIDTH, height - HEADER_HEIGHT);
    ctx.strokeStyle = '#e5e8ef';
    ctx.beginPath();
    ctx.moveTo(INDEX_WIDTH - 0.5, 0);
    ctx.lineTo(INDEX_WIDTH - 0.5, height);
    ctx.stroke();

    ctx.fillStyle = '#6b7280';
    ctx.fillText('#', 20, HEADER_HEIGHT / 2);

    fields.forEach((field, fieldIndex) => {
      const x = INDEX_WIDTH + fieldIndex * COLUMN_WIDTH - scrollOffset.left;
      if (x + COLUMN_WIDTH < INDEX_WIDTH || x > width) {
        return;
      }

      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(x, 0, COLUMN_WIDTH, HEADER_HEIGHT);
      ctx.strokeStyle = '#dde2ea';
      ctx.strokeRect(x - 0.5, 0.5, COLUMN_WIDTH, HEADER_HEIGHT);
      ctx.fillStyle = '#3f3f46';
      ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillText(clampText(ctx, field.name, COLUMN_WIDTH - 28), x + 12, HEADER_HEIGHT / 2);
      ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    });

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HEADER_HEIGHT, width, height - HEADER_HEIGHT);
    ctx.clip();

    const firstRow = Math.max(0, Math.floor((scrollOffset.top - HEADER_HEIGHT) / ROW_HEIGHT));
    const lastRow = Math.min(
      visibleRecords.length - 1,
      Math.ceil((scrollOffset.top + height - HEADER_HEIGHT) / ROW_HEIGHT),
    );

    for (let rowIndex = firstRow; rowIndex <= lastRow; rowIndex += 1) {
      const record = visibleRecords[rowIndex];
      if (!record) {
        continue;
      }

      const y = HEADER_HEIGHT + rowIndex * ROW_HEIGHT - scrollOffset.top;
      const isSelectedRow = selection?.rowIndex === rowIndex;

      ctx.fillStyle = isSelectedRow ? '#f4f2ff' : rowIndex % 2 === 0 ? '#ffffff' : '#fbfcfe';
      ctx.fillRect(0, y, width, ROW_HEIGHT);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, y, INDEX_WIDTH, ROW_HEIGHT);
      ctx.fillStyle = '#555b66';
      ctx.fillText(String(rowIndex + 1), 22, y + ROW_HEIGHT / 2);

      fields.forEach((field, fieldIndex) => {
        const x = INDEX_WIDTH + fieldIndex * COLUMN_WIDTH - scrollOffset.left;
        if (x + COLUMN_WIDTH < INDEX_WIDTH || x > width) {
          return;
        }

        const isSelected = selection?.rowIndex === rowIndex && selection.fieldIndex === fieldIndex;
        ctx.strokeStyle = '#e5e8ef';
        ctx.strokeRect(x - 0.5, y - 0.5, COLUMN_WIDTH, ROW_HEIGHT);

        if (isSelected) {
          ctx.strokeStyle = '#7b67ee';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, y + 1, COLUMN_WIDTH - 2, ROW_HEIGHT - 2);
          ctx.lineWidth = 1;
        }

        const value = renderCell(getFieldValue(record, field));
        ctx.fillStyle = value ? '#1f2937' : '#a1a7b3';
        ctx.fillText(clampText(ctx, value || '-', COLUMN_WIDTH - 24), x + 12, y + ROW_HEIGHT / 2);
      });

      ctx.strokeStyle = '#e5e8ef';
      ctx.beginPath();
      ctx.moveTo(0, y + ROW_HEIGHT - 0.5);
      ctx.lineTo(width, y + ROW_HEIGHT - 0.5);
      ctx.stroke();
    }

    ctx.restore();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, INDEX_WIDTH, HEADER_HEIGHT);
    ctx.strokeStyle = '#dde2ea';
    ctx.strokeRect(0.5, 0.5, INDEX_WIDTH, HEADER_HEIGHT);
    ctx.fillStyle = '#6b7280';
    ctx.fillText('#', 20, HEADER_HEIGHT / 2);

    if (visibleRecords.length === 0) {
      ctx.fillStyle = '#7b8190';
      ctx.fillText('Нет строк для отображения', INDEX_WIDTH + 16, HEADER_HEIGHT + ROW_HEIGHT / 2);
    }
  }, [fields, scrollOffset.left, scrollOffset.top, selection, viewport.height, viewport.width, visibleRecords]);

  const loadNextPage = useCallback(async () => {
    if (!attrs.datasheetId || isLoading || isMutating || !hasMore) {
      return;
    }

    try {
      setIsMutating(true);
      setErrorMessage('');
      const response = await wikiliveApi.listMwsRecords(attrs.datasheetId, {
        viewId: attrs.viewId,
        pageSize,
        pageNum: pageNum + 1,
        fields: selectedFieldIds,
        filterByFormula: attrs.filterByFormula,
      });
      setRecords((current) => [...current, ...response.items]);
      setPageNum(response.pageNum);
      setTotal(response.total);
      setStaleMessage('');
    } catch (error) {
      setStaleMessage(error instanceof Error ? error.message : 'Не удалось загрузить следующую страницу');
    } finally {
      setIsMutating(false);
    }
  }, [attrs.datasheetId, attrs.filterByFormula, attrs.viewId, hasMore, isLoading, isMutating, pageNum, pageSize, selectedFieldIds]);

  const updateCell = async (record: MwsRecord, field: MwsField, value: string | boolean) => {
    if (!attrs.datasheetId || !EDITABLE_FIELD_TYPES.has(field.type)) {
      return;
    }

    const parsedValue = parseEditedValue(field, value);
    const currentValue = getFieldValue(record, field);
    if (String(currentValue ?? '') === String(parsedValue ?? '')) {
      return;
    }

    try {
      setIsMutating(true);
      await wikiliveApi.updateMwsRecords(attrs.datasheetId, {
        fieldKey: 'id',
        records: [{ recordId: record.recordId, fields: { [field.id]: parsedValue } }],
      });
      setRecords((current) =>
        current.map((item) =>
          item.recordId === record.recordId
            ? { ...item, fields: { ...item.fields, [field.id]: parsedValue } }
            : item,
        ),
      );
      setStaleMessage('');
    } catch (error) {
      setStaleMessage(error instanceof Error ? error.message : 'Не удалось обновить ячейку');
    } finally {
      setIsMutating(false);
    }
  };

  const createRow = async () => {
    if (!attrs.datasheetId || fields.length === 0) {
      return;
    }

    const editableFields = fields.filter((field) => EDITABLE_FIELD_TYPES.has(field.type));
    const initialFields = Object.fromEntries(editableFields.map((field) => [field.id, field.type === 'Checkbox' ? false : '']));

    try {
      setIsMutating(true);
      await wikiliveApi.createMwsRecords(attrs.datasheetId, {
        fieldKey: 'id',
        records: [{ fields: initialFields }],
      });
      await loadEmbed();
    } catch (error) {
      setStaleMessage(error instanceof Error ? error.message : 'Не удалось добавить строку');
    } finally {
      setIsMutating(false);
    }
  };

  const deleteRow = async (record: MwsRecord | null) => {
    if (!attrs.datasheetId || !record) {
      return;
    }

    try {
      setIsMutating(true);
      await wikiliveApi.deleteMwsRecords(attrs.datasheetId, [record.recordId]);
      setRecords((current) => current.filter((item) => item.recordId !== record.recordId));
      setTotal((current) => Math.max(0, current - 1));
      setSelection(null);
      setEditingCell(null);
      setStaleMessage('');
    } catch (error) {
      setStaleMessage(error instanceof Error ? error.message : 'Не удалось удалить строку');
    } finally {
      setIsMutating(false);
    }
  };

  const hitTest = (event: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>): CanvasSelection | null => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (y < HEADER_HEIGHT || x < INDEX_WIDTH) {
      return null;
    }

    const rowIndex = Math.floor((y + scrollOffset.top - HEADER_HEIGHT) / ROW_HEIGHT);
    const fieldIndex = Math.floor((x + scrollOffset.left - INDEX_WIDTH) / COLUMN_WIDTH);

    if (rowIndex < 0 || rowIndex >= visibleRecords.length || fieldIndex < 0 || fieldIndex >= fields.length) {
      return null;
    }

    return { rowIndex, fieldIndex };
  };

  const beginEdit = (nextSelection: CanvasSelection | null) => {
    if (!nextSelection) {
      return;
    }

    const record = visibleRecords[nextSelection.rowIndex];
    const field = fields[nextSelection.fieldIndex];

    if (!record || !field || !canInlineEdit || !EDITABLE_FIELD_TYPES.has(field.type)) {
      return;
    }

    if (field.type === 'Checkbox') {
      void updateCell(record, field, !getFieldValue(record, field));
      return;
    }

    setEditingCell({
      ...nextSelection,
      left: INDEX_WIDTH + nextSelection.fieldIndex * COLUMN_WIDTH,
      top: HEADER_HEIGHT + nextSelection.rowIndex * ROW_HEIGHT,
      width: COLUMN_WIDTH,
      height: ROW_HEIGHT,
      value: renderCell(getFieldValue(record, field)),
    });
  };

  const commitEdit = () => {
    if (!editingCell) {
      return;
    }

    const record = visibleRecords[editingCell.rowIndex];
    const field = fields[editingCell.fieldIndex];
    setEditingCell(null);

    if (record && field) {
      void updateCell(record, field, editingCell.value);
    }
  };

  const handleCanvasScroll = () => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    setScrollOffset({ left: element.scrollLeft, top: element.scrollTop });

    if (element.scrollHeight - element.scrollTop - element.clientHeight < 120) {
      void loadNextPage();
    }
  };

  return (
    <NodeViewWrapper
      className={[
        'my-4 overflow-hidden rounded-lg border bg-white shadow-sm',
        selected ? 'border-[#7b67ee] ring-2 ring-[#7b67ee]/20' : 'border-editor-border-subtle',
      ].join(' ')}
      data-type="mws-table-embed"
      contentEditable={false}
    >
      <div className="flex items-start justify-between gap-3 border-b border-editor-border-subtle bg-[#f8fafc] px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-editor-text-tertiary">Live MWS Tables</p>
          <h3 className="truncate font-wide text-base font-semibold text-editor-text-primary">
            {embed?.node.name ?? attrs.datasheetId ?? 'Таблица'}
          </h3>
          <p className="mt-1 text-xs text-editor-text-tertiary">
            {embed?.view?.name ? `view: ${embed.view.name}` : 'default view'} · {records.length}/{total} строк
          </p>
        </div>
        {embed?.openInMwsUrl ? (
          <a
            href={embed.openInMwsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-editor-border-control px-3 py-1.5 text-xs font-semibold text-editor-text-primary"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Открыть в MWS
          </a>
        ) : null}
      </div>

      <div className="flex h-11 items-center gap-1 overflow-x-auto border-b border-editor-border-subtle bg-[#f5f6f8] px-2">
        <ToolbarButton label="" icon={<RotateCcw className="h-4 w-4" />} disabled />
        <ToolbarButton label="" icon={<RotateCw className="h-4 w-4" />} disabled />
        <div className="mx-1 h-6 w-px bg-[#dfe3ea]" />
        <ToolbarButton label="Вставить запись" icon={<PlusCircle className="h-4 w-4" />} onClick={() => void createRow()} disabled={!capabilities.canCreateRecords || isMutating || fields.length === 0} />
        <ToolbarButton label="Скрыть поля" icon={<EyeOff className="h-4 w-4" />} disabled />
        <ToolbarButton label="Фильтр" icon={<Filter className="h-4 w-4" />} disabled />
        <ToolbarButton label="Группа" icon={<Group className="h-4 w-4" />} disabled />
        <ToolbarButton label="Сортировка" icon={<SortAsc className="h-4 w-4" />} disabled />
        <ToolbarButton label="Удалить строку" icon={<Trash2 className="h-4 w-4" />} onClick={() => void deleteRow(selectedRecord)} disabled={!selectedRecord || !capabilities.canDeleteRecords || isMutating} />
        <ToolbarButton label="Обновить" icon={<RefreshCw className="h-4 w-4" />} onClick={() => void loadEmbed()} disabled={isLoading} />
        <div className="ml-auto flex h-8 shrink-0 items-center gap-1 rounded-md border border-[#dfe3ea] bg-white px-2">
          <Search className="h-4 w-4 text-[#626a75]" />
          <input
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setSelection(null);
              setEditingCell(null);
            }}
            placeholder="Найти"
            className="h-7 w-28 border-0 bg-transparent text-sm outline-none"
          />
        </div>
        <ToolbarButton label="Структура" icon={<Columns3 className="h-4 w-4" />} disabled />
        <ToolbarButton label="Дополнительно" icon={<Settings className="h-4 w-4" />} disabled />
      </div>

      <div className="p-4">
        {isLoading && records.length === 0 ? <div className="rounded-lg bg-[#f3f6fb] p-4 text-sm text-editor-text-tertiary">Загружаем живую таблицу...</div> : null}
        {!isLoading && errorMessage ? (
          <div className="rounded-lg border border-[#ffd2d9] bg-[#fff1f3] p-4 text-sm text-[#b00025]">{errorMessage}</div>
        ) : null}
        {staleMessage ? (
          <div className="mb-3 rounded-lg border border-[#ffe0a3] bg-[#fff8e6] p-3 text-sm text-[#8a5a00]">
            Показываем последние загруженные данные. {staleMessage}
          </div>
        ) : null}
        {!isLoading && !errorMessage && records.length === 0 ? (
          <div className="rounded-lg bg-[#f3f6fb] p-4 text-sm text-editor-text-tertiary">В выбранном view пока нет строк</div>
        ) : null}
        {!errorMessage && records.length > 0 ? (
          <div
            ref={scrollRef}
            onScroll={handleCanvasScroll}
            className="relative overflow-auto rounded-lg border border-editor-border-subtle bg-white"
            style={{ height: Math.min(MAX_GRID_HEIGHT, Math.max(MIN_GRID_HEIGHT, gridHeight)) }}
          >
            <div className="relative" style={{ width: Math.max(gridWidth, viewport.width), height: Math.max(gridHeight, viewport.height) }}>
              <div style={{ width: Math.max(gridWidth, viewport.width), height: Math.max(gridHeight, viewport.height) }} />
              <canvas
                ref={canvasRef}
                data-testid="mws_canvas_grid"
                className="absolute left-0 top-0 block cursor-cell bg-transparent"
                style={{
                  transform: `translate(${scrollOffset.left}px, ${scrollOffset.top}px)`,
                }}
                onPointerDown={(event) => {
                  const nextSelection = hitTest(event);
                  setSelection(nextSelection);
                  setEditingCell(null);
                }}
                onDoubleClick={(event) => beginEdit(hitTest(event))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    beginEdit(selection);
                  }
                }}
                tabIndex={0}
              />
              {editingCell ? (
                <input
                  autoFocus
                  value={editingCell.value}
                  type={fieldInputType(fields[editingCell.fieldIndex])}
                  onChange={(event) => setEditingCell((current) => (current ? { ...current, value: event.target.value } : current))}
                  onBlur={commitEdit}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitEdit();
                    }

                    if (event.key === 'Escape') {
                      event.preventDefault();
                      setEditingCell(null);
                    }
                  }}
                  className="absolute z-20 rounded border border-[#7b67ee] bg-white px-2 text-sm outline-none shadow-sm"
                  style={{
                    left: editingCell.left + 2,
                    top: editingCell.top + 2,
                    width: editingCell.width - 4,
                    height: editingCell.height - 4,
                  }}
                />
              ) : null}
            </div>
          </div>
        ) : null}
        {hasMore ? (
          <button
            type="button"
            onClick={() => void loadNextPage()}
            disabled={isMutating}
            className="mt-3 h-10 rounded-lg border border-editor-border-control px-4 text-sm font-semibold text-editor-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Загрузить еще
          </button>
        ) : null}
      </div>
    </NodeViewWrapper>
  );
}
