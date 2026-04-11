import { useEffect, useMemo, useState } from 'react';

import { type MwsNode, type MwsSpace, wikiliveApi } from '../../../shared/api/wikilive';

type TablePickerModalProps = {
  isOpen: boolean;
  onSelect: (payload: {
    spaceId: string;
    nodeId: string;
    datasheetId: string;
    title: string;
  }) => void;
  onClose: () => void;
};

function flattenNodes(nodes: MwsNode[]): MwsNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children ?? [])]);
}

export function TablePickerModal({ isOpen, onSelect, onClose }: TablePickerModalProps) {
  const [spaces, setSpaces] = useState<MwsSpace[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState('');
  const [nodes, setNodes] = useState<MwsNode[]>([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const flattenedNodes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const items = flattenNodes(nodes);

    if (!normalized) {
      return items;
    }

    return items.filter((node) => node.name.toLowerCase().includes(normalized) || node.type.toLowerCase().includes(normalized));
  }, [nodes, query]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setErrorMessage('');

    void wikiliveApi
      .listMwsSpaces()
      .then((response) => {
        if (cancelled) {
          return;
        }

        setSpaces(response.items);
        setSelectedSpaceId(response.items[0]?.id ?? '');
      })
      .catch((error) => {
        if (!cancelled) {
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
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !selectedSpaceId) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setErrorMessage('');

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

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90] bg-black/35" onMouseDown={onClose}>
      <div
        className="fixed left-1/2 top-1/2 flex w-[min(42rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-2xl bg-white p-5 shadow-[0_24px_70px_rgba(17,25,40,0.22)]"
        role="dialog"
        aria-modal="true"
        aria-label="Вставить MWS таблицу"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div>
          <h3 className="font-wide text-xl font-semibold">Вставить MWS Tables</h3>
          <p className="mt-1 text-sm text-editor-text-tertiary">Выберите существующую таблицу. В документ попадет live-ссылка, а не копия данных.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
          <select
            value={selectedSpaceId}
            onChange={(event) => setSelectedSpaceId(event.target.value)}
            className="h-11 rounded-xl border border-editor-border-control px-3 text-sm outline-none focus:border-[#7b67ee]"
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
            className="h-11 rounded-xl border border-editor-border-control px-4 text-sm outline-none focus:border-[#7b67ee]"
            placeholder="Поиск таблицы или ноды"
          />
        </div>

        <div className="max-h-80 overflow-y-auto rounded-xl border border-editor-border-subtle">
          {isLoading ? <p className="p-4 text-sm text-editor-text-tertiary">Загружаем MWS Tables...</p> : null}
          {!isLoading && errorMessage ? (
            <div className="space-y-2 p-4 text-sm text-[#b00025]">
              <p>{errorMessage}</p>
              <p className="text-editor-text-tertiary">Для демо укажите `MWS_TABLES_API_TOKEN` в backend окружении.</p>
            </div>
          ) : null}
          {!isLoading && !errorMessage && flattenedNodes.length === 0 ? (
            <p className="p-4 text-sm text-editor-text-tertiary">Ноды не найдены</p>
          ) : null}
          {flattenedNodes.map((node) => (
            <button
              key={node.id}
              type="button"
              onClick={() => onSelect({
                spaceId: selectedSpaceId,
                nodeId: node.id,
                datasheetId: node.datasheetId ?? node.dstId ?? node.id,
                title: node.name,
              })}
              className="flex w-full items-center justify-between gap-3 border-b border-editor-border-subtle px-4 py-3 text-left text-sm last:border-b-0 hover:bg-editor-bg-control"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold">{node.name}</span>
                <span className="mt-1 block text-xs text-editor-text-tertiary">{node.type}</span>
              </span>
              <span className="rounded-full bg-[#edf2ff] px-2 py-1 text-xs text-[#34518e]">live</span>
            </button>
          ))}
        </div>

        <button type="button" onClick={onClose} className="modal-action-secondary h-10 rounded-lg px-3 text-sm font-semibold">
          Отмена
        </button>
      </div>
    </div>
  );
}
