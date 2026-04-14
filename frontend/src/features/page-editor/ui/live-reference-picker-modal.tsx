import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';

import type { MwsField, MwsNode, MwsRecord, MwsSpace } from '../../../shared/api/wikilive';
import { wikiliveApi } from '../../../shared/api/wikilive';
import { ModalActionButton } from '../../../shared/ui';
import { filterNodesForPicker, getDatasheetId, isTableNode, nodePath } from '../../wiki-tables/model/use-table-picker-controller';
import type { LiveReferenceSelection } from '../model/live-reference';

type LiveReferencePickerModalProps = {
  isOpen: boolean;
  initialSpaceId: string;
  initialSelection?: LiveReferenceSelection | null;
  onSelect: (payload: LiveReferenceSelection) => void;
  onClose: () => void;
};

function flattenTableNodes(nodes: MwsNode[]): MwsNode[] {
  return nodes.flatMap((node) => {
    const children = flattenTableNodes(node.children ?? []);

    if (isTableNode(node)) {
      return [{ ...node, children: [] }, ...children];
    }

    return children;
  });
}

function toDisplayValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => toDisplayValue(item)).filter(Boolean).join(', ');
  }

  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    for (const key of ['text', 'title', 'name', 'value', 'label']) {
      const candidate = objectValue[key];
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }

    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }

  return '';
}

function getRecordLabel(record: MwsRecord, fields: MwsField[]): string {
  for (const field of fields) {
    const rawValue = record.fields?.[field.id];
    const display = toDisplayValue(rawValue).trim();
    if (display) {
      return display;
    }
  }

  return record.recordId;
}

export function LiveReferencePickerModal({
  isOpen,
  initialSpaceId,
  initialSelection = null,
  onSelect,
  onClose,
}: LiveReferencePickerModalProps) {
  const [spaces, setSpaces] = useState<MwsSpace[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState(initialSpaceId);
  const [nodes, setNodes] = useState<MwsNode[]>([]);
  const [query, setQuery] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [fields, setFields] = useState<MwsField[]>([]);
  const [records, setRecords] = useState<MwsRecord[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState('');
  const [selectedFieldId, setSelectedFieldId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const tableNodes = useMemo(() => flattenTableNodes(filterNodesForPicker(nodes)), [nodes]);

  const searchableNodes = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return tableNodes;
    }

    return tableNodes.filter((node) => {
      const haystack = `${node.name} ${nodePath(node)} ${node.type}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [query, tableNodes]);

  const selectedNode = useMemo(
    () => tableNodes.find((node) => node.id === selectedNodeId) ?? null,
    [selectedNodeId, tableNodes],
  );

  const selectedField = useMemo(
    () => fields.find((field) => field.id === selectedFieldId) ?? null,
    [fields, selectedFieldId],
  );

  const selectedRecord = useMemo(
    () => records.find((record) => record.recordId === selectedRecordId) ?? null,
    [records, selectedRecordId],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    const loadSpaces = async () => {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const response = await wikiliveApi.listMwsSpaces();
        if (cancelled) {
          return;
        }

        const items = response.items.length > 0 ? response.items : [{ id: initialSpaceId, name: initialSpaceId }];
        setSpaces(items);
        const targetSpaceId = initialSelection?.spaceId || initialSpaceId;
        setSelectedSpaceId(items.some((item) => item.id === targetSpaceId) ? targetSpaceId : items[0]?.id ?? targetSpaceId);
      } catch (error) {
        if (!cancelled) {
          setSpaces([{ id: initialSpaceId, name: initialSpaceId }]);
          setSelectedSpaceId(initialSpaceId);
          setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить пространства MWS');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadSpaces();

    return () => {
      cancelled = true;
    };
  }, [initialSpaceId, isOpen]);

  useEffect(() => {
    if (!isOpen || !selectedSpaceId) {
      return;
    }

    let cancelled = false;

    const loadNodes = async () => {
      setIsLoading(true);
      setErrorMessage('');
      setSelectedNodeId('');
      setFields([]);
      setRecords([]);

      try {
        const response = await wikiliveApi.listMwsNodes(selectedSpaceId);
        if (cancelled) {
          return;
        }

        setNodes(response.items);

        if (initialSelection?.datasheetId) {
          const existingNode = flattenTableNodes(filterNodesForPicker(response.items)).find(
            (node) => getDatasheetId(node) === initialSelection.datasheetId || node.id === initialSelection.datasheetId,
          );

          if (existingNode) {
            setSelectedNodeId(existingNode.id);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить таблицы MWS');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadNodes();

    return () => {
      cancelled = true;
    };
  }, [initialSelection?.datasheetId, isOpen, selectedSpaceId]);

  useEffect(() => {
    if (!selectedNode) {
      return;
    }

    let cancelled = false;

    const loadDetails = async () => {
      const datasheetId = getDatasheetId(selectedNode);
      setIsDetailsLoading(true);
      setErrorMessage('');

      try {
        const [fieldsResponse, recordsResponse] = await Promise.all([
          wikiliveApi.listMwsFields(datasheetId),
          wikiliveApi.listMwsRecords(datasheetId, { pageNum: 1, pageSize: 200 }),
        ]);

        if (cancelled) {
          return;
        }

        setFields(fieldsResponse.items);
        setRecords(recordsResponse.items);
        setSelectedFieldId(
          initialSelection?.fieldId && fieldsResponse.items.some((field) => field.id === initialSelection.fieldId)
            ? initialSelection.fieldId
            : fieldsResponse.items[0]?.id ?? '',
        );
        setSelectedRecordId(
          initialSelection?.recordId && recordsResponse.items.some((record) => record.recordId === initialSelection.recordId)
            ? initialSelection.recordId
            : recordsResponse.items[0]?.recordId ?? '',
        );
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить строки и колонки');
        }
      } finally {
        if (!cancelled) {
          setIsDetailsLoading(false);
        }
      }
    };

    void loadDetails();

    return () => {
      cancelled = true;
    };
  }, [initialSelection?.fieldId, initialSelection?.recordId, selectedNode]);

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[1000] bg-[rgba(17,24,39,0.38)] p-3 sm:p-6" onMouseDown={onClose}>
      <div
        className="fixed left-1/2 top-1/2 flex h-[92vh] w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[24px] bg-white shadow-[0_28px_80px_rgba(17,24,39,0.26)]"
        role="dialog"
        aria-modal="true"
        aria-label="Вставить живую переменную"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex-shrink-0 border-b border-[#b00025] bg-[#d70032] px-4 py-5 text-white sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/85">
                Живая переменная
              </div>
              <h3 className="mt-3 font-wide text-xl font-semibold sm:text-2xl">Живая переменная из таблицы</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/84">
                Выберите таблицу, строку и колонку. В документ вставится чип, который обновляется автоматически.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть живую переменную"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/12 text-white transition-colors hover:bg-white/18"
            >
              ×
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f6f7f9] px-4 py-4 sm:px-6">
          {errorMessage ? (
            <div className="mb-4 rounded-xl border border-[#ffd2d9] bg-[#fff7f8] px-4 py-3 text-sm text-[#b00025]">
              {errorMessage}
            </div>
          ) : null}

          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_1fr]">
            <section className="flex min-h-0 flex-col gap-3 rounded-[20px] border border-[#dfe5ee] bg-white p-4 shadow-[0_10px_24px_rgba(17,24,39,0.05)]">
              <select
                value={selectedSpaceId}
                onChange={(event) => setSelectedSpaceId(event.target.value)}
                className="h-10 rounded-xl border border-editor-border-control px-3 text-sm outline-none focus:border-[#d70032]"
              >
                {spaces.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name}
                  </option>
                ))}
              </select>

              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-10 rounded-xl border border-editor-border-control px-3 text-sm outline-none focus:border-[#d70032]"
                placeholder="Поиск таблицы"
              />

              <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-editor-border-subtle bg-white">
                {isLoading ? <p className="p-3 text-sm text-editor-text-tertiary">Загружаем таблицы...</p> : null}
                {!isLoading && searchableNodes.length === 0 ? <p className="p-3 text-sm text-editor-text-tertiary">Таблицы не найдены</p> : null}
                {!isLoading && searchableNodes.length > 0 ? (
                  <div>
                    {searchableNodes.map((node) => (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => setSelectedNodeId(node.id)}
                        className={[
                          'block w-full border-b border-editor-border-subtle px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[#fff7f8]',
                          node.id === selectedNodeId ? 'bg-[#fff0f3]' : '',
                        ].join(' ')}
                      >
                        <span className="block truncate font-semibold">{node.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-editor-text-tertiary">{nodePath(node)}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>

            <section className="flex min-h-0 flex-col gap-3 rounded-[20px] border border-[#dfe5ee] bg-white p-4 shadow-[0_10px_24px_rgba(17,24,39,0.05)]">
              <h4 className="font-semibold text-editor-text-primary">Параметры переменной</h4>
              {!selectedNode ? <p className="text-sm text-editor-text-tertiary">Сначала выберите таблицу слева.</p> : null}

              {selectedNode ? (
                <>
                  <label className="text-sm font-semibold text-editor-text-primary">
                    Строка
                    <select
                      value={selectedRecordId}
                      onChange={(event) => setSelectedRecordId(event.target.value)}
                      className="mt-1 h-10 w-full rounded-xl border border-editor-border-control px-3 text-sm font-normal outline-none focus:border-[#d70032]"
                    >
                      {records.map((record) => (
                        <option key={record.recordId} value={record.recordId}>
                          {getRecordLabel(record, fields)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm font-semibold text-editor-text-primary">
                    Колонка
                    <select
                      value={selectedFieldId}
                      onChange={(event) => setSelectedFieldId(event.target.value)}
                      className="mt-1 h-10 w-full rounded-xl border border-editor-border-control px-3 text-sm font-normal outline-none focus:border-[#d70032]"
                    >
                      {fields.map((field) => (
                        <option key={field.id} value={field.id}>
                          {field.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  {isDetailsLoading ? <p className="text-sm text-editor-text-tertiary">Загружаем строки и поля...</p> : null}
                  {!isDetailsLoading && records.length === 0 ? <p className="text-sm text-editor-text-tertiary">В таблице пока нет строк</p> : null}
                  {!isDetailsLoading && fields.length === 0 ? <p className="text-sm text-editor-text-tertiary">В таблице нет колонок</p> : null}
                </>
              ) : null}
            </section>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2 rounded-[20px] border border-[#dfe5ee] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(17,24,39,0.05)]">
            <ModalActionButton onClick={onClose} variant="secondary">
              Отмена
            </ModalActionButton>
            <ModalActionButton
              disabled={!selectedNode || !selectedRecord || !selectedField || isDetailsLoading}
              onClick={() => {
                if (!selectedNode || !selectedRecord || !selectedField) {
                  return;
                }

                onSelect({
                  spaceId: selectedSpaceId,
                  datasheetId: getDatasheetId(selectedNode),
                  recordId: selectedRecord.recordId,
                  fieldId: selectedField.id,
                  label: `${selectedNode.name} / ${getRecordLabel(selectedRecord, fields)} / ${selectedField.name}`,
                });
              }}
              variant="primary"
            >
              Вставить переменную
            </ModalActionButton>
          </div>
        </div>
      </div>
    </div>
    ,
    document.body,
  );
}
