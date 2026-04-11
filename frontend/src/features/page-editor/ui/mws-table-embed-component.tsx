import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import { ExternalLink, Plus, RefreshCw, Trash2 } from 'lucide-react';
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

function renderCell(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '-';
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

export function MwsTableEmbedComponent({ node, selected }: NodeViewProps) {
  const [data, setData] = useState<ResolveTableEmbedResponse | null>(null);
  const [records, setRecords] = useState<MwsRecord[]>([]);
  const [pageNum, setPageNum] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [staleMessage, setStaleMessage] = useState('');
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

  const loadNextPage = async () => {
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
  };

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

  const deleteRow = async (record: MwsRecord) => {
    if (!attrs.datasheetId) {
      return;
    }

    try {
      setIsMutating(true);
      await wikiliveApi.deleteMwsRecords(attrs.datasheetId, [record.recordId]);
      setRecords((current) => current.filter((item) => item.recordId !== record.recordId));
      setTotal((current) => Math.max(0, current - 1));
      setStaleMessage('');
    } catch (error) {
      setStaleMessage(error instanceof Error ? error.message : 'Не удалось удалить строку');
    } finally {
      setIsMutating(false);
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
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {embed?.openInMwsUrl ? (
            <a
              href={embed.openInMwsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-editor-border-control px-3 py-1.5 text-xs font-semibold text-editor-text-primary"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Открыть в MWS
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => void createRow()}
            disabled={!capabilities.canCreateRecords || isMutating || fields.length === 0}
            className="inline-flex items-center gap-1 rounded-lg border border-editor-border-control px-3 py-1.5 text-xs font-semibold text-editor-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Добавить строку
          </button>
          <button
            type="button"
            onClick={() => void loadEmbed()}
            disabled={isLoading}
            className="inline-flex items-center gap-1 rounded-lg bg-editor-bg-control px-3 py-1.5 text-xs font-semibold text-editor-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Обновить
          </button>
        </div>
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
          <div className="max-h-[32rem] overflow-auto rounded-lg border border-editor-border-subtle">
            <table className="min-w-max border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[#f7f9fc] text-xs uppercase tracking-[0.08em] text-editor-text-tertiary">
                <tr>
                  {fields.map((field) => (
                    <th key={field.id} className="min-w-40 border-b border-editor-border-subtle px-3 py-2 font-semibold">
                      {field.name}
                    </th>
                  ))}
                  <th className="sticky right-0 min-w-24 border-b border-editor-border-subtle bg-[#f7f9fc] px-3 py-2 font-semibold">Действия</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.recordId} className="border-b border-editor-border-subtle last:border-b-0">
                    {fields.map((field) => {
                      const value = getFieldValue(record, field);
                      const isEditable = canInlineEdit && EDITABLE_FIELD_TYPES.has(field.type);

                      return (
                        <td key={field.id} className="max-w-72 px-3 py-2 align-top">
                          {isEditable && field.type === 'Checkbox' ? (
                            <input
                              type="checkbox"
                              defaultChecked={Boolean(value)}
                              onChange={(event) => void updateCell(record, field, event.target.checked)}
                              className="h-4 w-4"
                            />
                          ) : null}
                          {isEditable && field.type !== 'Checkbox' ? (
                            <input
                              type={fieldInputType(field)}
                              defaultValue={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
                              onBlur={(event) => void updateCell(record, field, event.target.value)}
                              className="h-8 w-full min-w-40 rounded border border-transparent bg-transparent px-2 text-sm outline-none hover:border-editor-border-subtle focus:border-[#7b67ee] focus:bg-white"
                            />
                          ) : null}
                          {!isEditable ? (
                            <span className="block max-w-72 truncate text-editor-text-primary" title={renderCell(value)}>
                              {renderCell(value)}
                            </span>
                          ) : null}
                        </td>
                      );
                    })}
                    <td className="sticky right-0 bg-white px-3 py-2 align-top">
                      <button
                        type="button"
                        onClick={() => void deleteRow(record)}
                        disabled={!capabilities.canDeleteRecords || isMutating}
                        className="inline-flex items-center gap-1 rounded-lg border border-editor-border-control px-2 py-1 text-xs font-semibold text-editor-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
