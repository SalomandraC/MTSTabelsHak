import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

import { type ResolveTableEmbedResponse, wikiliveApi } from '../../../shared/api/wikilive';

function renderCell(value: unknown) {
  if (value === null || value === undefined) {
    return '—';
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return JSON.stringify(value);
}

export function MwsTableEmbedComponent({ node, selected }: NodeViewProps) {
  const [data, setData] = useState<ResolveTableEmbedResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

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

  const loadEmbed = async () => {
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
        selectedFieldIds: attrs.selectedFieldIds ?? [],
        filterByFormula: attrs.filterByFormula,
        pageSize: attrs.pageSize ?? 10,
        allowInlineEdit: attrs.allowInlineEdit ?? false,
      });
      setData(response);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить MWS Tables embed');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadEmbed();
    // Reload only when the persisted embed identity/config attrs change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attrs.spaceId, attrs.nodeId, attrs.datasheetId, attrs.viewId, attrs.pageSize]);

  const embed = data?.embed;
  const fields = embed?.fields.slice(0, 6) ?? [];
  const records = embed?.preview.items.slice(0, attrs.pageSize ?? 10) ?? [];

  return (
    <NodeViewWrapper
      className={[
        'my-4 overflow-hidden rounded-2xl border bg-white shadow-sm',
        selected ? 'border-[#7b67ee] ring-2 ring-[#7b67ee]/20' : 'border-editor-border-subtle',
      ].join(' ')}
      data-type="mws-table-embed"
    >
      <div className="flex items-start justify-between gap-3 border-b border-editor-border-subtle bg-[#f8fafc] px-4 py-3" contentEditable={false}>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-editor-text-tertiary">Live MWS Tables embed</p>
          <h3 className="truncate font-wide text-base font-semibold text-editor-text-primary">
            {embed?.node.name ?? attrs.datasheetId ?? 'Таблица'}
          </h3>
          <p className="mt-1 text-xs text-editor-text-tertiary">
            datasheet: {attrs.datasheetId} {attrs.viewId ? `· view: ${attrs.viewId}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {embed?.openInMwsUrl ? (
            <a
              href={embed.openInMwsUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-editor-border-control px-3 py-1.5 text-xs font-semibold text-editor-text-primary"
            >
              Открыть в MWS
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => void loadEmbed()}
            className="inline-flex items-center gap-1 rounded-lg bg-editor-bg-control px-3 py-1.5 text-xs font-semibold text-editor-text-primary"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Обновить
          </button>
        </div>
      </div>

      <div className="p-4" contentEditable={false}>
        {isLoading ? <div className="rounded-xl bg-[#f3f6fb] p-4 text-sm text-editor-text-tertiary">Загружаем живую таблицу...</div> : null}
        {!isLoading && errorMessage ? (
          <div className="rounded-xl border border-[#ffd2d9] bg-[#fff1f3] p-4 text-sm text-[#b00025]">{errorMessage}</div>
        ) : null}
        {!isLoading && !errorMessage && records.length === 0 ? (
          <div className="rounded-xl bg-[#f3f6fb] p-4 text-sm text-editor-text-tertiary">В выбранном view пока нет строк</div>
        ) : null}
        {!isLoading && !errorMessage && records.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-editor-border-subtle">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-[#f7f9fc] text-xs uppercase tracking-[0.08em] text-editor-text-tertiary">
                <tr>
                  {fields.map((field) => (
                    <th key={field.id} className="border-b border-editor-border-subtle px-3 py-2 font-semibold">
                      {field.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.recordId} className="border-b border-editor-border-subtle last:border-b-0">
                    {fields.map((field) => (
                      <td key={field.id} className="max-w-[14rem] truncate px-3 py-2">
                        {renderCell(record.fields[field.id] ?? record.fields[field.name])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </NodeViewWrapper>
  );
}
