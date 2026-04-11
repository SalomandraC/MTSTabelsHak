import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { type CreateMwsFieldPayload, type MwsField, type MwsRecord, type ResolveTableEmbedResponse, wikiliveApi } from '../../../shared/api/wikilive';
import { WikiTableEmbed, type WikiTableEmbedAttrs } from './wiki-table-embed';

const EDITABLE_FIELD_TYPES = new Set([
  'SingleText',
  'Text',
  'SingleSelect',
  'MultiSelect',
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

export type SelectOption = {
  name: string;
  color: string;
};

export type EditingSelectCell = CanvasSelection & {
  left: number;
  top: number;
  width: number;
  options: SelectOption[];
  values: string[];
  multiple: boolean;
};

type BeginEditOptions = {
  replaceValue?: string;
  fromSingleClick?: boolean;
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

function parseEditedValue(field: MwsField, value: unknown) {
  if (field.type === 'Checkbox') {
    return Boolean(value);
  }

  if (field.type === 'SingleSelect') {
    return value;
  }

  if (field.type === 'MultiSelect') {
    return Array.isArray(value) ? value : [];
  }

  if (['Number', 'Currency', 'Percent'].includes(field.type)) {
    return value === '' ? null : Number(value);
  }

  return String(value);
}

function readOptionName(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (value && typeof value === 'object') {
    const candidate = (value as { name?: unknown }).name;
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return null;
}

function readSelectOptions(field: MwsField): SelectOption[] {
  const property = field.property;
  if (!property || typeof property !== 'object') {
    return [];
  }

  const options = (property as { options?: unknown }).options;
  if (!Array.isArray(options)) {
    return [];
  }

  return options
    .map((item) => {
      if (typeof item === 'string') {
        return { name: item, color: 'blue' };
      }

      if (item && typeof item === 'object') {
        const name = readOptionName(item);
        const color = (item as { color?: unknown }).color;
        if (name) {
          return {
            name,
            color: typeof color === 'string' && color.trim().length > 0 ? color : 'blue',
          };
        }
      }

      return null;
    })
    .filter((item): item is SelectOption => Boolean(item));
}

function readSelectedOptionNames(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(readOptionName).filter((item): item is string => Boolean(item));
  }

  const single = readOptionName(value);
  return single ? [single] : [];
}

function toSelectPatchValue(field: MwsField, currentValue: unknown, selectedNames: string[]) {
  const hasObjectShape = (value: unknown) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
  const isMultiple = field.type === 'MultiSelect';

  if (isMultiple) {
    if (Array.isArray(currentValue)) {
      const storesObjects = currentValue.some((item) => hasObjectShape(item));
      return storesObjects
        ? selectedNames.map((name) => ({ name }))
        : selectedNames;
    }

    if (hasObjectShape(currentValue)) {
      return selectedNames.map((name) => ({ name }));
    }

    return selectedNames;
  }

  const nextValue = selectedNames[0] ?? '';
  if (hasObjectShape(currentValue)) {
    return nextValue ? { name: nextValue } : null;
  }

  return nextValue;
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
  const [editingSelectCell, setEditingSelectCell] = useState<EditingSelectCell | null>(null);

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
      setEditingSelectCell(null);
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
  const selectedField = selection ? fields[selection.fieldIndex] ?? null : null;

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

  const updateCell = async (record: MwsRecord, field: MwsField, value: unknown) => {
    if (!attrs.datasheetId || !EDITABLE_FIELD_TYPES.has(field.type)) {
      return;
    }

    const parsedValue = parseEditedValue(field, value);
    const currentValue = getFieldValue(record, field);
    if (JSON.stringify(currentValue ?? null) === JSON.stringify(parsedValue ?? null)) {
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
    const initialFields = Object.fromEntries(
      editableFields.map((field) => {
        if (field.type === 'Checkbox') {
          return [field.id, false];
        }

        if (field.type === 'MultiSelect') {
          return [field.id, []];
        }

        return [field.id, ''];
      }),
    );

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

  const createField = async (payload: Omit<CreateMwsFieldPayload, 'spaceId'>) => {
    if (!attrs.datasheetId || !attrs.spaceId) {
      return;
    }

    try {
      setIsMutating(true);
      await wikiliveApi.createMwsField(attrs.datasheetId, {
        spaceId: attrs.spaceId,
        ...payload,
      });
      await loadEmbed();
    } catch (error) {
      setStaleMessage(error instanceof Error ? error.message : 'Не удалось создать столбец');
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
      setEditingSelectCell(null);
      setStaleMessage('');
    } catch (error) {
      setStaleMessage(error instanceof Error ? error.message : 'Не удалось удалить строку');
    } finally {
      setIsMutating(false);
    }
  };

  const uploadAttachment = async (record: MwsRecord | null, field: MwsField | null, file: File) => {
    if (!attrs.datasheetId || !record || !field || field.type !== 'Attachment') {
      return;
    }

    try {
      setIsMutating(true);
      await wikiliveApi.uploadMwsAttachment(attrs.datasheetId, {
        file,
        recordId: record.recordId,
        fieldId: field.id,
      });
      await loadEmbed();
    } catch (error) {
      setStaleMessage(error instanceof Error ? error.message : 'Не удалось загрузить файл в ячейку');
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

  const beginEdit = (nextSelection: CanvasSelection | null, options?: BeginEditOptions) => {
    if (!nextSelection) {
      return;
    }

    const record = visibleRecords[nextSelection.rowIndex];
    const field = fields[nextSelection.fieldIndex];

    if (!record || !field || !canInlineEdit || !EDITABLE_FIELD_TYPES.has(field.type)) {
      return;
    }

    if (field.type === 'Checkbox') {
      setEditingSelectCell(null);
      void updateCell(record, field, !getFieldValue(record, field));
      return;
    }

    if (field.type === 'SingleSelect' || field.type === 'MultiSelect') {
      const availableOptions = readSelectOptions(field);
      if (availableOptions.length > 0) {
        const values = readSelectedOptionNames(getFieldValue(record, field));
        setEditingCell(null);
        setEditingSelectCell({
          ...nextSelection,
          left: INDEX_WIDTH + nextSelection.fieldIndex * COLUMN_WIDTH,
          top: HEADER_HEIGHT + nextSelection.rowIndex * ROW_HEIGHT,
          width: COLUMN_WIDTH,
          options: availableOptions,
          values,
          multiple: field.type === 'MultiSelect',
        });
        return;
      }
    }

    if (options?.fromSingleClick) {
      return;
    }

    setEditingSelectCell(null);
    setEditingCell({
      ...nextSelection,
      left: INDEX_WIDTH + nextSelection.fieldIndex * COLUMN_WIDTH,
      top: HEADER_HEIGHT + nextSelection.rowIndex * ROW_HEIGHT,
      width: COLUMN_WIDTH,
      height: ROW_HEIGHT,
      value: options?.replaceValue ?? renderCell(getFieldValue(record, field)),
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

  const clearSelectValue = () => {
    if (!editingSelectCell) {
      return;
    }

    const record = visibleRecords[editingSelectCell.rowIndex];
    const field = fields[editingSelectCell.fieldIndex];
    if (!record || !field || (field.type !== 'SingleSelect' && field.type !== 'MultiSelect')) {
      return;
    }

    const nextNames: string[] = [];
    const patchValue = toSelectPatchValue(field, getFieldValue(record, field), nextNames);
    setEditingSelectCell((current) => (current ? { ...current, values: nextNames } : current));
    void updateCell(record, field, patchValue);
  };

  const applySelectValue = (optionName: string) => {
    if (!editingSelectCell) {
      return;
    }

    const record = visibleRecords[editingSelectCell.rowIndex];
    const field = fields[editingSelectCell.fieldIndex];
    if (!record || !field || (field.type !== 'SingleSelect' && field.type !== 'MultiSelect')) {
      return;
    }

    const isMultiple = field.type === 'MultiSelect';
    let nextNames: string[];

    if (isMultiple) {
      const current = new Set(editingSelectCell.values);
      if (current.has(optionName)) {
        current.delete(optionName);
      } else {
        current.add(optionName);
      }
      nextNames = [...current];
      setEditingSelectCell((currentCell) => (currentCell ? { ...currentCell, values: nextNames } : currentCell));
    } else {
      nextNames = [optionName];
      setEditingSelectCell(null);
    }

    const patchValue = toSelectPatchValue(field, getFieldValue(record, field), nextNames);
    void updateCell(record, field, patchValue);
  };

  const handleCanvasScroll = () => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    setScrollOffset({ left: element.scrollLeft, top: element.scrollTop });
    setEditingSelectCell(null);

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
    editingSelectCell,
    setEditingSelectCell,
    scrollRef,
    canvasRef,
    canInlineEdit,
    capabilities,
    hasMore,
    gridWidth,
    gridHeight,
    visibleRecords,
    selectedRecord,
    selectedField,
    loadEmbed,
    loadNextPage,
    createRow,
    createField,
    deleteRow,
    uploadAttachment,
    hitTest,
    beginEdit,
    commitEdit,
    clearSelectValue,
    applySelectValue,
    handleCanvasScroll,
  };
}
