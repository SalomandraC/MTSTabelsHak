import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { type MwsField, type MwsRecord, type ResolveTableEmbedResponse, wikiliveApi } from '../../../shared/api/wikilive';
import { WikiTableEmbed, type WikiTableEmbedAttrs } from './wiki-table-embed';

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

export const HEADER_HEIGHT = 40;
export const ROW_HEIGHT = 38;
export const INDEX_WIDTH = 56;
export const COLUMN_WIDTH = 184;
export const MIN_GRID_HEIGHT = 320;
export const MAX_GRID_HEIGHT = 520;

export type CanvasSelection = {
  rowIndex: number;
  fieldIndex: number;
};

export type EditingCell = CanvasSelection & {
  left: number;
  top: number;
  width: number;
  height: number;
  value: string;
};

export function renderCell(value: unknown): string {
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

export function getFieldValue(record: MwsRecord, field: MwsField) {
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

export function fieldInputType(field: MwsField) {
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

export function clampText(ctx: CanvasRenderingContext2D, value: string, maxWidth: number) {
  if (ctx.measureText(value).width <= maxWidth) {
    return value;
  }

  let next = value;
  while (next.length > 1 && ctx.measureText(`${next}...`).width > maxWidth) {
    next = next.slice(0, -1);
  }

  return `${next}...`;
}

export function useWikiTableEmbed(rawAttrs: Partial<WikiTableEmbedAttrs> | null | undefined) {
  const attrs = useMemo(() => WikiTableEmbed.fromNodeAttrs(rawAttrs).toJSON(), [rawAttrs]);
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
        displayMode: attrs.displayMode,
        selectedFieldIds: attrs.selectedFieldIds,
        filterByFormula: attrs.filterByFormula,
        pageSize,
        allowInlineEdit: attrs.allowInlineEdit,
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
  }, [attrs.allowInlineEdit, attrs.datasheetId, attrs.displayMode, attrs.filterByFormula, attrs.nodeId, attrs.selectedFieldIds, attrs.spaceId, attrs.viewId, pageSize]);

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
        fields: attrs.selectedFieldIds,
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
  }, [attrs.datasheetId, attrs.filterByFormula, attrs.selectedFieldIds, attrs.viewId, hasMore, isLoading, isMutating, pageNum, pageSize]);

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

  return {
    attrs,
    embed,
    fields,
    records,
    total,
    isLoading,
    isMutating,
    errorMessage,
    staleMessage,
    searchQuery,
    setSearchQuery,
    viewport,
    scrollOffset,
    selection,
    setSelection,
    editingCell,
    setEditingCell,
    scrollRef,
    canvasRef,
    canInlineEdit,
    capabilities,
    hasMore,
    gridWidth,
    gridHeight,
    visibleRecords,
    selectedRecord,
    loadEmbed,
    loadNextPage,
    createRow,
    deleteRow,
    hitTest,
    beginEdit,
    commitEdit,
    handleCanvasScroll,
  };
}
