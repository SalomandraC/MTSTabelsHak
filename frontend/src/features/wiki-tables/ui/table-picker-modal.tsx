import { createPortal } from 'react-dom';
import { useState } from 'react';

import type { MwsNode } from '../../../shared/api/wikilive';
import { ModalActionButton } from '../../../shared/ui';
import { getMwsFieldTypeLabel } from '../model/mws-field-types';
import { getDatasheetId, isFolderNode, isTableNode, nodePath, useTablePickerController } from '../model/use-table-picker-controller';
import type { WikiTableSelection } from '../model/wiki-table-embed';

type TablePickerModalProps = {
  isOpen: boolean;
  initialSpaceId: string;
  onSelect: (payload: WikiTableSelection) => void;
  onClose: () => void;
};

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
  const typeLabel = isTableNode(node) ? 'MWS table' : isFolderNode(node) ? 'Папка' : node.type;

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
          <span className="mt-0.5 block truncate text-xs text-editor-text-tertiary">{typeLabel}</span>
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

export function WikiTablePickerModal({ isOpen, initialSpaceId, onSelect, onClose }: TablePickerModalProps) {
  const controller = useTablePickerController({ isOpen, initialSpaceId });

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[220] bg-black/35" onMouseDown={onClose}>
      <div
        className="fixed left-1/2 top-1/2 flex max-h-[calc(100vh-2rem)] w-[min(56rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-hidden rounded-lg bg-white p-5 shadow-[0_24px_70px_rgba(17,25,40,0.22)]"
        role="dialog"
        aria-modal="true"
        aria-label="Вставить MWS таблицу"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div>
          <h3 className="font-wide text-xl font-semibold">Вставить MWS Tables</h3>
          <p className="mt-1 text-sm text-editor-text-tertiary">Показываем только папки и таблицы MWS, чтобы вставка live-блока была быстрее и понятнее.</p>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_20rem]">
          <section className="flex min-h-0 flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
              <select
                value={controller.selectedSpaceId}
                onChange={(event) => controller.setSelectedSpaceId(event.target.value)}
                className="h-11 rounded-lg border border-editor-border-control px-3 text-sm outline-none focus:border-[#7b67ee]"
              >
                {controller.spaces.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name}
                  </option>
                ))}
              </select>
              <input
                value={controller.query}
                onChange={(event) => controller.setQuery(event.target.value)}
                className="h-11 rounded-lg border border-editor-border-control px-4 text-sm outline-none focus:border-[#7b67ee]"
                placeholder="Поиск по вложенным таблицам"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-editor-border-subtle">
              {controller.isLoading ? <p className="p-4 text-sm text-editor-text-tertiary">Загружаем MWS Tables...</p> : null}
              {!controller.isLoading && controller.errorMessage ? (
                <div className="space-y-2 p-4 text-sm text-[#b00025]">
                  <p>{controller.errorMessage}</p>
                  <p className="text-editor-text-tertiary">Проверьте MWS API token и доступ к выбранному пространству.</p>
                </div>
              ) : null}
              {!controller.isLoading && !controller.errorMessage && controller.query.trim() ? (
                controller.searchableNodes.length > 0 ? (
                  <div>
                    {controller.searchableNodes.map((node) => (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => controller.setSelectedNode(node)}
                        className={[
                          'block w-full border-b border-editor-border-subtle px-4 py-3 text-left text-sm last:border-b-0 hover:bg-editor-bg-control',
                          controller.selectedNode?.id === node.id ? 'bg-[#eef2ff]' : '',
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
              {!controller.isLoading && !controller.errorMessage && !controller.query.trim() ? (
                controller.nodes.length > 0 ? (
                  <ul>
                    {controller.nodes.map((node) => (
                      <NodeTreeItem key={node.id} node={node} depth={0} onSelect={controller.setSelectedNode} />
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
                {controller.selectedNode ? controller.selectedNode.name : 'Таблица не выбрана'}
              </h4>
              {controller.selectedNode ? <p className="mt-1 truncate text-xs text-editor-text-tertiary">{nodePath(controller.selectedNode)}</p> : null}
            </div>

            {controller.selectedNode ? (
              <>
                <label className="text-sm font-semibold">
                  View
                  <select
                    value={controller.selectedViewId ?? ''}
                    onChange={(event) => controller.setSelectedViewId(event.target.value || null)}
                    className="mt-1 h-10 w-full rounded-lg border border-editor-border-control px-3 text-sm font-normal outline-none focus:border-[#7b67ee]"
                  >
                    {controller.views.length === 0 ? <option value="">Default</option> : null}
                    {controller.views.map((view) => (
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
                    value={controller.pageSize}
                    onChange={(event) => controller.setPageSize(Number(event.target.value) || 50)}
                    className="mt-1 h-10 w-full rounded-lg border border-editor-border-control px-3 text-sm font-normal outline-none focus:border-[#7b67ee]"
                  />
                </label>

                <label className="inline-flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={controller.allowInlineEdit}
                    onChange={(event) => controller.setAllowInlineEdit(event.target.checked)}
                  />
                  Разрешить inline edit
                </label>

                <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-editor-border-subtle p-2">
                  {controller.isConfigLoading ? <p className="p-2 text-sm text-editor-text-tertiary">Загружаем поля...</p> : null}
                  {!controller.isConfigLoading && controller.fields.length === 0 ? <p className="p-2 text-sm text-editor-text-tertiary">Поля не найдены</p> : null}
                  {controller.fields.map((field) => (
                    <label key={field.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-editor-bg-control">
                      <input
                        type="checkbox"
                        checked={controller.selectedFieldIds.includes(field.id)}
                        onChange={(event) => {
                          controller.setSelectedFieldIds((current) =>
                            event.target.checked ? [...current, field.id] : current.filter((id) => id !== field.id),
                          );
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate">{field.name}</span>
                      <span className="text-xs text-editor-text-tertiary">{getMwsFieldTypeLabel(field.type)}</span>
                    </label>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-editor-text-tertiary">Слева можно раскрывать папки и выбирать таблицы на любом уровне вложенности. Другие типы MWS здесь скрыты.</p>
            )}
          </aside>
        </div>

        <div className="flex items-center justify-end gap-2">
          <ModalActionButton onClick={onClose} variant="secondary">
            Отмена
          </ModalActionButton>
          <ModalActionButton
            disabled={!controller.canInsert}
            onClick={() => {
              if (!controller.selectedNode) {
                return;
              }

              onSelect({
                spaceId: controller.selectedSpaceId,
                nodeId: controller.selectedNode.id,
                datasheetId: getDatasheetId(controller.selectedNode),
                title: controller.selectedNode.name,
                viewId: controller.selectedViewId,
                selectedFieldIds: controller.selectedFieldIds,
                pageSize: controller.pageSize,
                allowInlineEdit: controller.allowInlineEdit,
              });
            }}
            variant="primary"
          >
            Вставить live table
          </ModalActionButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
