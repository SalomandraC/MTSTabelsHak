import { useEffect, useMemo, useState } from 'react';

import { type MwsField, type MwsNode, type MwsSpace, type MwsView, wikiliveApi } from '../../../shared/api/wikilive';

export type TablePickerSelection = {
  spaceId: string;
  nodeId: string;
  datasheetId: string;
  title: string;
  viewId: string | null;
  selectedFieldIds: string[];
  pageSize: number;
  allowInlineEdit: boolean;
};

type TablePickerModalProps = {
  isOpen: boolean;
  initialSpaceId: string;
  onSelect: (payload: TablePickerSelection) => void;
  onClose: () => void;
};

function isTableNode(node: MwsNode) {
  const type = node.type.toLowerCase();
  return Boolean(node.datasheetId ?? node.dstId) || type.includes('datasheet') || type.includes('table');
}

function getDatasheetId(node: MwsNode) {
  return node.datasheetId ?? node.dstId ?? node.id;
}

function flattenNodes(nodes: MwsNode[]): MwsNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children ?? [])]);
}

function nodePath(node: MwsNode) {
  return node.path?.filter(Boolean).join(' / ') || node.name;
}

function NodeTreeItem({
  node,
  depth,
  onSelect,
}: {
  node: MwsNode;
  depth: number;
  onSelect: (node: MwsNode) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = Boolean(node.children?.length);
  const canSelect = isTableNode(node);

  return (
    <li>
      <div className="flex items-center gap-2 border-b border-editor-border-subtle px-3 py-2 last:border-b-0" style={{ paddingLeft: `${0.75 + depth * 0.8}rem` }}>
        {hasChildren ? (
          <button type="button" onClick={() => setIsExpanded((value) => !value)} className="h-6 w-6 rounded border border-editor-border-subtle text-xs">
            {isExpanded ? '-' : '+'}
          </button>
        ) : (
          <span className="h-6 w-6" />
        )}
        <button
          type="button"
          disabled={!canSelect}
          onClick={() => onSelect(node)}
          className={[
            'min-w-0 flex-1 text-left text-sm',
            canSelect ? 'text-editor-text-primary hover:text-[#7b67ee]' : 'cursor-default text-editor-text-tertiary',
          ].join(' ')}
        >
          <span className="block truncate font-semibold">{node.name}</span>
          <span className="mt-0.5 block truncate text-xs text-editor-text-tertiary">{canSelect ? 'MWS table' : node.type}</span>
        </button>
      </div>
      {hasChildren && isExpanded ? (
        <ul>
          {node.children?.map((child) => (
            <NodeTreeItem key={child.id} node={child} depth={depth + 1} onSelect={onSelect} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function TablePickerModal({ isOpen, initialSpaceId, onSelect, onClose }: TablePickerModalProps) {
  const [spaces, setSpaces] = useState<MwsSpace[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState(initialSpaceId);
  const [nodes, setNodes] = useState<MwsNode[]>([]);
  const [query, setQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<MwsNode | null>(null);
  const [views, setViews] = useState<MwsView[]>([]);
  const [fields, setFields] = useState<MwsField[]>([]);
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([]);
  const [pageSize, setPageSize] = useState(50);
  const [allowInlineEdit, setAllowInlineEdit] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isConfigLoading, setIsConfigLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const searchableNodes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const items = flattenNodes(nodes).filter(isTableNode);

    if (!normalized) {
      return items;
    }

    return items.filter((node) => {
      const haystack = `${node.name} ${node.type} ${nodePath(node)}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }, [nodes, query]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setErrorMessage('');
    setSelectedNode(null);
    setSelectedViewId(null);
    setFields([]);
    setViews([]);

    void wikiliveApi
      .listMwsSpaces()
      .then((response) => {
        if (cancelled) {
          return;
        }

        const nextSpaces = response.items.length > 0 ? response.items : [{ id: initialSpaceId, name: initialSpaceId }];
        setSpaces(nextSpaces);
        setSelectedSpaceId(nextSpaces.some((space) => space.id === initialSpaceId) ? initialSpaceId : nextSpaces[0]?.id ?? initialSpaceId);
      })
      .catch((error) => {
        if (!cancelled) {
          setSpaces([{ id: initialSpaceId, name: initialSpaceId }]);
          setSelectedSpaceId(initialSpaceId);
          setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить пространства MWS Tables');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialSpaceId, isOpen]);

  useEffect(() => {
    if (!isOpen || !selectedSpaceId) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setErrorMessage('');
    setSelectedNode(null);

    void wikiliveApi
      .listMwsNodes(selectedSpaceId)
      .then((response) => {
        if (!cancelled) {
          setNodes(response.items);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить ноды MWS Tables');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedSpaceId]);

  useEffect(() => {
    if (!selectedNode) {
      return;
    }

    let cancelled = false;
    const datasheetId = getDatasheetId(selectedNode);

    setIsConfigLoading(true);
    setErrorMessage('');
    setViews([]);
    setFields([]);
    setSelectedFieldIds([]);

    void (async () => {
      const viewsResponse = await wikiliveApi.listMwsViews(datasheetId);
      const nextViewId = viewsResponse.items[0]?.id ?? null;
      const fieldsResponse = await wikiliveApi.listMwsFields(datasheetId, nextViewId);

      if (cancelled) {
        return;
      }

      setViews(viewsResponse.items);
      setSelectedViewId(nextViewId);
      setFields(fieldsResponse.items);
      setSelectedFieldIds(fieldsResponse.items.map((field) => field.id));
    })()
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить настройки таблицы');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsConfigLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedNode]);

  useEffect(() => {
    if (!selectedNode || !selectedViewId) {
      return;
    }

    let cancelled = false;
    const datasheetId = getDatasheetId(selectedNode);

    setIsConfigLoading(true);

    void wikiliveApi
      .listMwsFields(datasheetId, selectedViewId)
      .then((response) => {
        if (!cancelled) {
          setFields(response.items);
          setSelectedFieldIds(response.items.map((field) => field.id));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить поля view');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsConfigLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedNode, selectedViewId]);

  if (!isOpen) {
    return null;
  }

  const canInsert = Boolean(selectedNode) && !isConfigLoading;

  return (
    <div className="fixed inset-0 z-[90] bg-black/35" onMouseDown={onClose}>
      <div
        className="fixed left-1/2 top-1/2 flex max-h-[calc(100vh-2rem)] w-[min(56rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-hidden rounded-lg bg-white p-5 shadow-[0_24px_70px_rgba(17,25,40,0.22)]"
        role="dialog"
        aria-modal="true"
        aria-label="Вставить MWS таблицу"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div>
          <h3 className="font-wide text-xl font-semibold">Вставить MWS Tables</h3>
          <p className="mt-1 text-sm text-editor-text-tertiary">Выберите таблицу из дерева пространства и настройте live-блок.</p>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_20rem]">
          <section className="flex min-h-0 flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
              <select
                value={selectedSpaceId}
                onChange={(event) => setSelectedSpaceId(event.target.value)}
                className="h-11 rounded-lg border border-editor-border-control px-3 text-sm outline-none focus:border-[#7b67ee]"
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
                className="h-11 rounded-lg border border-editor-border-control px-4 text-sm outline-none focus:border-[#7b67ee]"
                placeholder="Поиск по вложенным таблицам"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-editor-border-subtle">
              {isLoading ? <p className="p-4 text-sm text-editor-text-tertiary">Загружаем MWS Tables...</p> : null}
              {!isLoading && errorMessage ? (
                <div className="space-y-2 p-4 text-sm text-[#b00025]">
                  <p>{errorMessage}</p>
                  <p className="text-editor-text-tertiary">Проверьте MWS API token и доступ к выбранному пространству.</p>
                </div>
              ) : null}
              {!isLoading && !errorMessage && query.trim() ? (
                searchableNodes.length > 0 ? (
                  <div>
                    {searchableNodes.map((node) => (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => setSelectedNode(node)}
                        className={[
                          'block w-full border-b border-editor-border-subtle px-4 py-3 text-left text-sm last:border-b-0 hover:bg-editor-bg-control',
                          selectedNode?.id === node.id ? 'bg-[#eef2ff]' : '',
                        ].join(' ')}
                      >
                        <span className="font-semibold">{node.name}</span>
                        <span className="mt-1 block truncate text-xs text-editor-text-tertiary">{nodePath(node)}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="p-4 text-sm text-editor-text-tertiary">Вложенные таблицы не найдены</p>
                )
              ) : null}
              {!isLoading && !errorMessage && !query.trim() ? (
                nodes.length > 0 ? (
                  <ul>
                    {nodes.map((node) => (
                      <NodeTreeItem key={node.id} node={node} depth={0} onSelect={setSelectedNode} />
                    ))}
                  </ul>
                ) : (
                  <p className="p-4 text-sm text-editor-text-tertiary">Ноды не найдены</p>
                )
              ) : null}
            </div>
          </section>

          <aside className="flex min-h-0 flex-col gap-3 rounded-lg border border-editor-border-subtle p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-editor-text-tertiary">Настройка live-блока</p>
              <h4 className="mt-1 truncate font-wide text-base font-semibold">
                {selectedNode ? selectedNode.name : 'Таблица не выбрана'}
              </h4>
              {selectedNode ? <p className="mt-1 truncate text-xs text-editor-text-tertiary">{nodePath(selectedNode)}</p> : null}
            </div>

            {selectedNode ? (
              <>
                <label className="text-sm font-semibold">
                  View
                  <select
                    value={selectedViewId ?? ''}
                    onChange={(event) => setSelectedViewId(event.target.value || null)}
                    className="mt-1 h-10 w-full rounded-lg border border-editor-border-control px-3 text-sm font-normal outline-none focus:border-[#7b67ee]"
                  >
                    {views.length === 0 ? <option value="">Default</option> : null}
                    {views.map((view) => (
                      <option key={view.id} value={view.id}>
                        {view.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-semibold">
                  Размер загрузки
                  <input
                    type="number"
                    min={10}
                    max={200}
                    value={pageSize}
                    onChange={(event) => setPageSize(Number(event.target.value) || 50)}
                    className="mt-1 h-10 w-full rounded-lg border border-editor-border-control px-3 text-sm font-normal outline-none focus:border-[#7b67ee]"
                  />
                </label>

                <label className="inline-flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={allowInlineEdit}
                    onChange={(event) => setAllowInlineEdit(event.target.checked)}
                  />
                  Разрешить inline edit
                </label>

                <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-editor-border-subtle p-2">
                  {isConfigLoading ? <p className="p-2 text-sm text-editor-text-tertiary">Загружаем поля...</p> : null}
                  {!isConfigLoading && fields.length === 0 ? <p className="p-2 text-sm text-editor-text-tertiary">Поля не найдены</p> : null}
                  {fields.map((field) => (
                    <label key={field.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-editor-bg-control">
                      <input
                        type="checkbox"
                        checked={selectedFieldIds.includes(field.id)}
                        onChange={(event) => {
                          setSelectedFieldIds((current) =>
                            event.target.checked ? [...current, field.id] : current.filter((id) => id !== field.id),
                          );
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate">{field.name}</span>
                      <span className="text-xs text-editor-text-tertiary">{field.type}</span>
                    </label>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-editor-text-tertiary">Слева можно раскрывать папки и выбирать таблицы на любом уровне вложенности.</p>
            )}
          </aside>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="modal-action-secondary h-10 rounded-lg px-3 text-sm font-semibold">
            Отмена
          </button>
          <button
            type="button"
            disabled={!canInsert}
            onClick={() => {
              if (!selectedNode) {
                return;
              }

              onSelect({
                spaceId: selectedSpaceId,
                nodeId: selectedNode.id,
                datasheetId: getDatasheetId(selectedNode),
                title: selectedNode.name,
                viewId: selectedViewId,
                selectedFieldIds,
                pageSize,
                allowInlineEdit,
              });
            }}
            className="h-10 rounded-lg bg-[#ff0037] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-editor-border-control"
          >
            Вставить live table
          </button>
        </div>
      </div>
    </div>
  );
}
