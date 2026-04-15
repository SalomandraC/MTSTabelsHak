import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { MwsTableActionBar } from './mws-table-action-bar';
import { AttachmentUploadModal } from './attachment-upload-modal';
import { CreateFieldModal } from './create-field-modal';
import { ExpandedTableModal } from './expanded-table-modal';
import { FieldActionsMenu } from './field-actions-menu';
import { FilterRecordsModal } from './filter-records-modal';
import { GroupRecordsModal } from './group-records-modal';
import { HideFieldsModal } from './hide-fields-modal';
import { SortFieldsModal } from './sort-fields-modal';
import { TableGridCanvas } from './table-grid-canvas';
import {
  ADD_COLUMN_WIDTH,
  ADD_ROW_HEIGHT,
  clampText,
  COLUMN_WIDTH,
  getFieldValue,
  HEADER_HEIGHT,
  INDEX_WIDTH,
  renderCell,
  ROW_HEIGHT,
  useWikiTableEmbed
} from '../model/use-wiki-table-embed';
import type { MwsField, MwsRecord } from '../../../shared/api/wikilive';

type AiTableMutationDetail = {
  datasheetId?: string;
  op?: 'create_records' | 'add_table_column' | 'refresh';
  records?: MwsRecord[];
  field?: MwsField;
};

type AiTableRefreshDetail = {
  datasheetId?: string | null;
  viewId?: string | null;
  reason?: string;
};

function isDirectEditKey(event: React.KeyboardEvent<HTMLElement>) {
  return (
    event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey
  );
}

export function MwsTableEmbedComponent({ node, selected }: NodeViewProps) {
  const controller = useWikiTableEmbed(node.attrs);
  const controllerRef = useRef<typeof controller | null>(null);

  useEffect(() => {
    controllerRef.current = controller;
  }, [controller]);

  useEffect(() => {
    const datasheetId = controller.attrs.datasheetId;
    if (!datasheetId) {
      return;
    }

    const globalStore = (window as unknown as {
      __wikiliveTableSnapshots?: Record<string, unknown>;
    });

    if (!globalStore.__wikiliveTableSnapshots) {
      globalStore.__wikiliveTableSnapshots = {};
    }

    globalStore.__wikiliveTableSnapshots[datasheetId] = {
      datasheetId,
      viewId: controller.attrs.viewId ?? null,
      fields: controller.fields,
      records: controller.records.slice(0, 200),
      total: controller.total,
      updatedAt: Date.now(),
    };
  }, [
    controller.attrs.datasheetId,
    controller.attrs.viewId,
    controller.fields,
    controller.records,
    controller.total,
  ]);

  useEffect(() => {
    const handleRefreshRequest = (event: Event) => {
      const customEvent = event as CustomEvent<AiTableRefreshDetail>;
      const detail = customEvent.detail;
      const targetDatasheetId = detail?.datasheetId ?? undefined;

      if (targetDatasheetId && targetDatasheetId !== controller.attrs.datasheetId) {
        return;
      }

      void controller.refreshTable();
    };

    const handleMutation = (event: Event) => {
      const customEvent = event as CustomEvent<AiTableMutationDetail>;
      const detail = customEvent.detail;
      const targetDatasheetId = detail?.datasheetId;

      if (!targetDatasheetId || targetDatasheetId !== controller.attrs.datasheetId) {
        return;
      }

      if (detail.op === 'create_records' && Array.isArray(detail.records) && detail.records.length > 0) {
        controller.applyAiRecords(detail.records);
      }

      if (detail.op === 'add_table_column' && detail.field) {
        controller.applyAiField(detail.field);
      }

      void controller.refreshTable();
    };

    window.addEventListener('wikilive:ai-table-refresh-request', handleRefreshRequest);
    window.addEventListener('wikilive:ai-table-mutation', handleMutation);
    return () => {
      window.removeEventListener('wikilive:ai-table-refresh-request', handleRefreshRequest);
      window.removeEventListener('wikilive:ai-table-mutation', handleMutation);
    };
  }, [controller]);
  const [isCreateFieldModalOpen, setIsCreateFieldModalOpen] = useState(false);
  const [isHideFieldsModalOpen, setIsHideFieldsModalOpen] = useState(false);
  const [isSortFieldsModalOpen, setIsSortFieldsModalOpen] = useState(false);
  const [isFilterRecordsModalOpen, setIsFilterRecordsModalOpen] =
    useState(false);
  const [isGroupRecordsModalOpen, setIsGroupRecordsModalOpen] = useState(false);
  const [isExpandedViewOpen, setIsExpandedViewOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isAttachmentWidgetDismissed, setIsAttachmentWidgetDismissed] =
    useState(false);
  const [isAttachmentUploadModalOpen, setIsAttachmentUploadModalOpen] =
    useState(false);
  const [attachmentUploadFiles, setAttachmentUploadFiles] = useState<File[]>(
    []
  );
  const [attachmentUploadError, setAttachmentUploadError] = useState('');
  const [activeFieldMenu, setActiveFieldMenu] = useState<{
    field: MwsField;
    x: number;
    y: number;
  } | null>(null);
  const selectEditorRef = useRef<HTMLDivElement | null>(null);
  const activeFieldMenuIndex = activeFieldMenu
    ? controller.visibleFields.findIndex(
        (field) => field.id === activeFieldMenu.field.id
      )
    : -1;

  const selectColorToCss = (color: string) => {
    const palette: Record<string, string> = {
      red: '#ef4444',
      orange: '#f97316',
      yellow: '#f59e0b',
      green: '#22c55e',
      teal: '#14b8a6',
      blue: '#3b82f6',
      purple: '#8b5cf6',
      gray: '#6b7280'
    };

    return palette[color.toLowerCase()] ?? color;
  };

  useEffect(() => {
    const canvas = controller.canvasRef.current;
    if (!canvas) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, controller.viewport.width);
    const height = Math.max(1, controller.viewport.height);
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

    controller.visibleFields.forEach((field, fieldIndex) => {
      const x =
        INDEX_WIDTH + fieldIndex * COLUMN_WIDTH - controller.scrollOffset.left;
      if (x + COLUMN_WIDTH < INDEX_WIDTH || x > width) {
        return;
      }

      const isActiveFieldMenuColumn = fieldIndex === activeFieldMenuIndex;
      ctx.fillStyle = isActiveFieldMenuColumn ? '#e8f0ff' : '#f8fafc';
      ctx.fillRect(x, 0, COLUMN_WIDTH, HEADER_HEIGHT);
      ctx.strokeStyle = '#dde2ea';
      ctx.strokeRect(x - 0.5, 0.5, COLUMN_WIDTH, HEADER_HEIGHT);
      ctx.fillStyle = isActiveFieldMenuColumn ? '#1d4ed8' : '#3f3f46';
      ctx.font =
        '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillText(
        clampText(ctx, field.name, COLUMN_WIDTH - 28),
        x + 12,
        HEADER_HEIGHT / 2
      );
      ctx.font =
        '13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    });

    const addColumnX =
      INDEX_WIDTH +
      controller.visibleFields.length * COLUMN_WIDTH -
      controller.scrollOffset.left;
    if (addColumnX < width) {
      const visibleAddColumnWidth = Math.min(
        ADD_COLUMN_WIDTH,
        width - addColumnX
      );
      if (visibleAddColumnWidth > 0) {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(addColumnX, 0, visibleAddColumnWidth, HEADER_HEIGHT);
        ctx.strokeStyle = '#dde2ea';
        ctx.strokeRect(
          addColumnX - 0.5,
          0.5,
          visibleAddColumnWidth,
          HEADER_HEIGHT
        );
        ctx.fillStyle = '#7b8190';
        ctx.font =
          '600 20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          '+',
          addColumnX + visibleAddColumnWidth / 2,
          HEADER_HEIGHT / 2
        );
        ctx.textAlign = 'left';
        ctx.font =
          '13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      }
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HEADER_HEIGHT, width, height - HEADER_HEIGHT);
    ctx.clip();

    const firstRow = Math.max(
      0,
      Math.floor((controller.scrollOffset.top - HEADER_HEIGHT) / ROW_HEIGHT)
    );
    const lastRow = Math.min(
      controller.visibleRows.length - 1,
      Math.ceil(
        (controller.scrollOffset.top + height - HEADER_HEIGHT) / ROW_HEIGHT
      )
    );

    for (let rowIndex = firstRow; rowIndex <= lastRow; rowIndex += 1) {
      const row = controller.visibleRows[rowIndex];
      if (!row) {
        continue;
      }

      const y =
        HEADER_HEIGHT + rowIndex * ROW_HEIGHT - controller.scrollOffset.top;
      const isSelectedRow = controller.selection?.rowIndex === rowIndex;

      ctx.fillStyle = isSelectedRow
        ? '#f4f2ff'
        : rowIndex % 2 === 0
          ? '#ffffff'
          : '#fbfcfe';
      ctx.fillRect(0, y, width, ROW_HEIGHT);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, y, INDEX_WIDTH, ROW_HEIGHT);
      ctx.fillStyle = '#555b66';
      ctx.fillText(String(rowIndex + 1), 22, y + ROW_HEIGHT / 2);

      if (row.kind === 'group') {
        ctx.fillStyle = '#f3f4f6';
        ctx.fillRect(INDEX_WIDTH, y, width - INDEX_WIDTH, ROW_HEIGHT);
        ctx.fillStyle = '#6b7280';
        ctx.font =
          '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillText(
          `${row.label} (${row.count})`,
          INDEX_WIDTH + 12,
          y + ROW_HEIGHT / 2
        );
        ctx.font =
          '13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      } else {
        const record = row.record;
        controller.visibleFields.forEach((field, fieldIndex) => {
          const x =
            INDEX_WIDTH +
            fieldIndex * COLUMN_WIDTH -
            controller.scrollOffset.left;
          if (x + COLUMN_WIDTH < INDEX_WIDTH || x > width) {
            return;
          }

          const isSelected =
            controller.selection?.rowIndex === rowIndex &&
            controller.selection.fieldIndex === fieldIndex;
          const isActiveFieldMenuColumn = fieldIndex === activeFieldMenuIndex;
          if (isActiveFieldMenuColumn) {
            ctx.fillStyle = rowIndex % 2 === 0 ? '#eff5ff' : '#e8f0ff';
            ctx.fillRect(x, y, COLUMN_WIDTH, ROW_HEIGHT);
          }
          ctx.strokeStyle = '#e5e8ef';
          ctx.strokeRect(x - 0.5, y - 0.5, COLUMN_WIDTH, ROW_HEIGHT);

          if (isSelected) {
            ctx.strokeStyle = '#7b67ee';
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 1, y + 1, COLUMN_WIDTH - 2, ROW_HEIGHT - 2);
            ctx.lineWidth = 1;
          }

          const value = renderCell(getFieldValue(record, field), field);
          ctx.fillStyle = value ? '#1f2937' : '#a1a7b3';
          ctx.fillText(
            clampText(ctx, value || '-', COLUMN_WIDTH - 24),
            x + 12,
            y + ROW_HEIGHT / 2
          );
        });
      }

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

    if (controller.visibleRows.length === 0) {
      ctx.fillStyle = '#7b8190';
      ctx.fillText(
        'Нет строк для отображения',
        INDEX_WIDTH + 16,
        HEADER_HEIGHT + ROW_HEIGHT / 2
      );
    }

    const addRowY =
      HEADER_HEIGHT +
      controller.visibleRows.length * ROW_HEIGHT -
      controller.scrollOffset.top;
    if (addRowY < height) {
      const visibleAddRowHeight = Math.min(ADD_ROW_HEIGHT, height - addRowY);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, addRowY, width, visibleAddRowHeight);
      ctx.strokeStyle = '#e5e8ef';
      ctx.beginPath();
      ctx.moveTo(0, addRowY - 0.5);
      ctx.lineTo(width, addRowY - 0.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(INDEX_WIDTH - 0.5, addRowY);
      ctx.lineTo(INDEX_WIDTH - 0.5, addRowY + visibleAddRowHeight);
      ctx.stroke();
      ctx.fillStyle = '#7b8190';
      ctx.font =
        '600 20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('+', INDEX_WIDTH / 2, addRowY + visibleAddRowHeight / 2);
      ctx.textAlign = 'left';
      ctx.font =
        '13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    }
  }, [
    controller.canvasRef,
    controller.scrollOffset.left,
    controller.scrollOffset.top,
    controller.selection,
    controller.viewport.height,
    controller.viewport.width,
    controller.visibleFields,
    controller.visibleRows,
    activeFieldMenuIndex
  ]);

  useEffect(() => {
    if (
      !controller.selection ||
      controller.editingCell ||
      controller.editingSelectCell ||
      !controller.canvasRef.current
    ) {
      return;
    }

    controller.canvasRef.current.focus();
  }, [
    controller.canvasRef,
    controller.editingCell,
    controller.editingSelectCell,
    controller.selection
  ]);

  useEffect(() => {
    if (!controller.editingSelectCell) {
      return;
    }

    const handlePointerDownOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (
        selectEditorRef.current?.contains(target) ||
        controller.canvasRef.current?.contains(target)
      ) {
        return;
      }

      controller.setEditingSelectCell(null);
    };

    document.addEventListener('pointerdown', handlePointerDownOutside);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutside);
    };
  }, [
    controller.canvasRef,
    controller.editingSelectCell,
    controller.setEditingSelectCell
  ]);

  useEffect(() => {
    setIsAttachmentWidgetDismissed(false);
  }, [controller.selectedRecord?.recordId, controller.selectedField?.id]);

  const canUploadToCell =
    controller.selectedRecord &&
    controller.selectedField?.type === 'Attachment';
  const canDownloadFromCell =
    controller.selectedField?.type === 'Attachment' &&
    controller.selectedAttachments.length > 0;

  const handleSearchQueryChange = (value: string) => {
    controller.setSearchQuery(value);
    controller.setSelection(null);
    controller.setEditingCell(null);
    controller.setEditingSelectCell(null);
    setActiveFieldMenu(null);
  };

  const openAttachmentUploadModal = () => {
    setAttachmentUploadError('');
    setAttachmentUploadFiles([]);
    setIsAttachmentUploadModalOpen(true);
  };

  const closeAttachmentUploadModal = () => {
    setIsAttachmentUploadModalOpen(false);
    setAttachmentUploadFiles([]);
    setAttachmentUploadError('');
  };

  const tableTitle =
    controller.embed?.node.name ??
    controller.attrs.title ??
    controller.attrs.datasheetId ??
    'Таблица';
  const viewName = controller.embed?.view?.name ?? 'default view';
  const rowSummary = `${controller.records.length}/${controller.total} строк`;

  const toggleCollapsed = () => {
    setIsCollapsed((current) => {
      const next = !current;
      if (next) {
        setIsExpandedViewOpen(false);
        controller.setSelection(null);
        controller.setEditingCell(null);
        controller.setEditingSelectCell(null);
        setActiveFieldMenu(null);
      }

      return next;
    });
  };

  const openFieldMenu = ({
    fieldIndex,
    clientX,
    clientY
  }: {
    fieldIndex: number;
    clientX: number;
    clientY: number;
  }) => {
    const field = controller.visibleFields[fieldIndex];
    if (!field) {
      return;
    }

    setActiveFieldMenu({
      field,
      x: clientX,
      y: clientY + 8
    });
  };

  const applySingleFieldSort = (field: MwsField, desc: boolean) => {
    const next = [
      {
        id: `sort-rule-${Date.now()}`,
        fieldId: field.id,
        desc
      },
      ...controller.sortRules.filter((rule) => rule.fieldId !== field.id)
    ];
    controller.applySort(next);
  };

  const addFieldFilter = (field: MwsField) => {
    controller.setFilterRules((current) => {
      if (current.some((rule) => rule.fieldId === field.id)) {
        return current;
      }

      return [
        ...current,
        {
          id: `filter-rule-${Date.now()}`,
          fieldId: field.id,
          operator: 'contains',
          value: ''
        }
      ];
    });
    setIsFilterRecordsModalOpen(true);
  };

  const applyFieldGrouping = (field: MwsField, desc: boolean) => {
    controller.applyGroup({ fieldId: field.id, desc });
  };

  const hideField = (field: MwsField) => {
    controller.setHiddenFieldIds((current) =>
      current.includes(field.id) ? current : [...current, field.id]
    );
  };

  const downloadAllAttachments = async () => {
    for (const attachment of controller.selectedAttachments) {
      await controller.downloadAttachment(attachment);
    }
  };

  const resetAllTransforms = () => {
    controller.applySort([]);
    controller.setFilterRules([]);
    controller.applyGroup(null);
    setActiveFieldMenu(null);
  };

  const sortableFields = useMemo(
    () => controller.fields.filter(f => f.type !== 'Attachment'),
    [controller.fields],
  );

  return (
    <NodeViewWrapper
      className={[
        'my-4 flex flex-col overflow-hidden rounded-lg border bg-white shadow-sm',
        selected
          ? 'border-[#d70032] ring-2 ring-[#d70032]/20'
          : 'border-editor-border-subtle'
      ].join(' ')}
      data-type="mws-table-embed"
      data-datasheet-id={controller.attrs.datasheetId ?? undefined}
      data-view-id={controller.attrs.viewId ?? undefined}
      contentEditable={false}
      onKeyDownCapture={(event: React.KeyboardEvent<HTMLDivElement>) => {
        if (
          !controller.selection ||
          controller.editingCell ||
          controller.editingSelectCell ||
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement ||
          event.target instanceof HTMLSelectElement
        ) {
          return;
        }

        if (isDirectEditKey(event)) {
          event.preventDefault();
          event.stopPropagation();
          controller.canvasRef.current?.focus();
          controller.beginEdit(controller.selection, {
            replaceValue: event.key
          });
        }
      }}
    >
      <div className="group/mws-table relative flex min-w-0 flex-1 flex-col">
        <div
          className={[
            'grid transition-[grid-template-rows,opacity] duration-300 ease-out',
            isCollapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
          ].join(' ')}
          aria-hidden={isCollapsed}
        >
          <div className="min-h-0 overflow-hidden">
            <div
              className={[
                'flex items-start justify-between gap-3 border-b border-editor-border-subtle bg-[#f8fafc] px-4 py-3 transition-transform duration-300 ease-out',
                isCollapsed ? '-translate-y-1 pointer-events-none' : 'translate-y-0'
              ].join(' ')}
            >
              <div className="min-w-0">
                <p className="text-[11px] text-editor-text-tertiary">
                  {controller.updatedAgoSec === null
                    ? 'Синхронизация...'
                    : `Обновлено ${controller.updatedAgoSec} сек назад`}
                  {controller.nextRefreshInSec !== null
                    ? ` · Следующее обновление через ${controller.nextRefreshInSec} сек`
                    : ''}
                </p>
                <h2 className="truncate font-wide text-base font-semibold text-editor-text-primary leading-none">
                  {tableTitle}
                </h2>
                <p className="text-xs text-editor-text-tertiary">
                  {viewName} · {rowSummary}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  aria-expanded={!isCollapsed}
                  className="inline-flex items-center gap-1 rounded-lg border border-editor-border-control bg-white px-3 py-1.5 text-xs font-semibold text-editor-text-primary transition-colors hover:bg-[#edf0f5]"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                  Свернуть
                </button>
                {controller.embed?.openInMwsUrl ? (
                  <a
                    href={controller.embed.openInMwsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-editor-border-control bg-white px-3 py-1.5 text-xs font-semibold text-editor-text-primary transition-colors hover:bg-[#edf0f5]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Открыть в MWS
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {isCollapsed ? (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!isCollapsed}
            className="absolute right-3 top-3 z-20 inline-flex items-center gap-1 rounded-lg border border-[#dfe3ea] bg-white/95 px-3 py-1.5 text-xs font-semibold text-editor-text-primary opacity-0 shadow-sm backdrop-blur transition-opacity hover:bg-[#edf0f5] focus:opacity-100 group-hover/mws-table:opacity-100"
          >
            <ChevronRight className="h-3.5 w-3.5" />
            Развернуть
          </button>
        ) : null}

        <div
          className={[
            'grid transition-[grid-template-rows,opacity] duration-300 ease-out',
            isCollapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
          ].join(' ')}
          aria-hidden={isCollapsed}
        >
          <div
            className={[
              'min-h-0 overflow-hidden transition-transform duration-300 ease-out',
              isCollapsed ? '-translate-y-1 pointer-events-none' : 'translate-y-0'
            ].join(' ')}
          >
            <MwsTableActionBar
              canCreateRow={
                Boolean(controller.capabilities.canCreateRecords) &&
                !controller.isMutating &&
                controller.fields.length > 0
              }
              canDeleteRow={
                Boolean(
                  controller.selectedRecord &&
                  controller.capabilities.canDeleteRecords
                ) && !controller.isMutating
              }
              canUploadToCell={Boolean(canUploadToCell) && !controller.isMutating}
              canDownloadFromCell={canDownloadFromCell && !controller.isMutating}
              canManageFields={controller.fields.length > 0}
              canExpand={controller.records.length > 0}
              isLoading={controller.isLoading}
              isMutating={controller.isMutating}
              hasActiveFilter={controller.filterRules.length > 0}
              hasActiveGroup={Boolean(controller.groupRule)}
              hasActiveSort={controller.sortRules.length > 0}
              searchQuery={controller.searchQuery}
              onSearchQueryChange={handleSearchQueryChange}
              onCreateRow={() => void controller.createRow()}
              onCreateField={() => setIsCreateFieldModalOpen(true)}
              onOpenFilePicker={openAttachmentUploadModal}
              onDownloadSelectedAttachment={() => {
                const first = controller.selectedAttachments[0];
                if (first) {
                  void controller.downloadAttachment(first);
                }
              }}
              onHideFields={() => setIsHideFieldsModalOpen(true)}
              onFilter={() => setIsFilterRecordsModalOpen(true)}
              onGroup={() => setIsGroupRecordsModalOpen(true)}
              onSort={() => setIsSortFieldsModalOpen(true)}
              onDeleteRow={() =>
                void controller.deleteRow(controller.selectedRecord)
              }
              onExpand={() => setIsExpandedViewOpen(true)}
              onRefresh={() => void controllerRef.current?.loadEmbed()}
              onResetAll={resetAllTransforms}
            />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {controller.isLoading && controller.records.length === 0 ? (
            <div className="m-4 rounded-lg bg-[#f3f6fb] p-4 text-sm text-editor-text-tertiary">
              Загружаем живую таблицу...
            </div>
          ) : null}
          {!controller.isLoading && controller.errorMessage ? (
            <div className="m-4 rounded-lg border border-[#ffd2d9] bg-[#fff1f3] p-4 text-sm text-[#b00025]">
              {controller.errorMessage}
            </div>
          ) : null}
          {controller.staleMessage ? (
            <div className="m-4 mb-0 rounded-lg border border-[#ffe0a3] bg-[#fff8e6] p-3 text-sm text-[#8a5a00]">
              Показываем последние загруженные данные.{' '}
              {controller.staleMessage}
            </div>
          ) : null}
          {!controller.isLoading &&
          !controller.errorMessage &&
          controller.records.length === 0 ? (
            <div className="m-4 rounded-lg bg-[#f3f6fb] p-4 text-sm text-editor-text-tertiary">
              В выбранном view пока нет строк
            </div>
          ) : null}
          {!controller.errorMessage &&
          controller.records.length > 0 &&
          !isExpandedViewOpen ? (
            <TableGridCanvas
              controller={controller}
              isReadOnly={isCollapsed}
              selectColorToCss={selectColorToCss}
              isAttachmentWidgetDismissed={isAttachmentWidgetDismissed}
              onAttachmentWidgetClose={() =>
                setIsAttachmentWidgetDismissed(true)
              }
              onOpenAttachmentUpload={
                isCollapsed ? undefined : openAttachmentUploadModal
              }
              onDownloadAllAttachments={
                isCollapsed ? undefined : () => void downloadAllAttachments()
              }
              onOpenFieldMenu={isCollapsed ? undefined : openFieldMenu}
              onAddColumn={
                isCollapsed ? undefined : () => setIsCreateFieldModalOpen(true)
              }
              onAddRow={isCollapsed ? undefined : () => void controller.createRow()}
              onCanvasKeyDown={(
                event: React.KeyboardEvent<HTMLCanvasElement>
              ) => {
                if (
                  !controller.selection ||
                  controller.editingCell ||
                  controller.editingSelectCell ||
                  event.target instanceof HTMLInputElement ||
                  event.target instanceof HTMLTextAreaElement ||
                  event.target instanceof HTMLSelectElement
                ) {
                  return;
                }

                if (isDirectEditKey(event)) {
                  event.preventDefault();
                  event.stopPropagation();
                  controller.canvasRef.current?.focus();
                  controller.beginEdit(controller.selection, {
                    replaceValue: event.key
                  });
                }
              }}
              selectEditorRef={selectEditorRef}
            />
          ) : null}
          {controller.hasMore && !isExpandedViewOpen && !isCollapsed ? (
            <button
              type="button"
              onClick={() => void controller.loadNextPage()}
              disabled={controller.isMutating}
              className="m-4 mt-3 h-10 self-start rounded-lg border border-editor-border-control px-4 text-sm font-semibold text-editor-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Загрузить еще
            </button>
          ) : null}
        </div>
      </div>
      <FieldActionsMenu
        fieldName={activeFieldMenu?.field.name ?? ''}
        position={
          activeFieldMenu
            ? {
                x: activeFieldMenu.x,
                y: activeFieldMenu.y
              }
            : null
        }
        onClose={() => setActiveFieldMenu(null)}
        onSortAsc={() => {
          if (activeFieldMenu) {
            applySingleFieldSort(activeFieldMenu.field, false);
          }
        }}
        onSortDesc={() => {
          if (activeFieldMenu) {
            applySingleFieldSort(activeFieldMenu.field, true);
          }
        }}
        onAddFilter={() => {
          if (activeFieldMenu) {
            addFieldFilter(activeFieldMenu.field);
          }
        }}
        onGroupAsc={() => {
          if (activeFieldMenu) {
            applyFieldGrouping(activeFieldMenu.field, false);
          }
        }}
        onGroupDesc={() => {
          if (activeFieldMenu) {
            applyFieldGrouping(activeFieldMenu.field, true);
          }
        }}
        onHideField={() => {
          if (activeFieldMenu) {
            hideField(activeFieldMenu.field);
          }
        }}
      />
      <CreateFieldModal
        isOpen={isCreateFieldModalOpen}
        isSubmitting={controller.isMutating}
        onClose={() => setIsCreateFieldModalOpen(false)}
        onSubmit={(payload) => {
          void controller
            .createField(payload)
            .then(() => setIsCreateFieldModalOpen(false));
        }}
      />
      <HideFieldsModal
        isOpen={isHideFieldsModalOpen}
        fields={controller.fields}
        hiddenFieldIds={controller.hiddenFieldIds}
        onChangeHiddenFieldIds={controller.setHiddenFieldIds}
        onClose={() => setIsHideFieldsModalOpen(false)}
      />
      <SortFieldsModal
        isOpen={isSortFieldsModalOpen}
        fields={sortableFields}
        sortRules={controller.sortRules}
        onChangeSortRules={controller.applySort}
        onClose={() => setIsSortFieldsModalOpen(false)}
      />
      <FilterRecordsModal
        isOpen={isFilterRecordsModalOpen}
        fields={controller.fields}
        filterRules={controller.filterRules}
        onChangeFilterRules={controller.setFilterRules}
        onClose={() => setIsFilterRecordsModalOpen(false)}
      />
      <GroupRecordsModal
        isOpen={isGroupRecordsModalOpen}
        fields={controller.fields}
        groupRule={controller.groupRule}
        onChangeGroupRule={controller.applyGroup}
        onClose={() => setIsGroupRecordsModalOpen(false)}
      />
      <ExpandedTableModal
        isOpen={isExpandedViewOpen}
        controller={controller}
        tableTitle={
          controller.embed?.node.name ?? controller.attrs.title ?? 'Таблица'
        }
        selectColorToCss={selectColorToCss}
        selectEditorRef={selectEditorRef}
        onClose={() => setIsExpandedViewOpen(false)}
        onOpenFieldMenu={openFieldMenu}
        onSearchQueryChange={handleSearchQueryChange}
        onCreateField={() => setIsCreateFieldModalOpen(true)}
        onHideFields={() => setIsHideFieldsModalOpen(true)}
        onFilter={() => setIsFilterRecordsModalOpen(true)}
        onGroup={() => setIsGroupRecordsModalOpen(true)}
        onSort={() => setIsSortFieldsModalOpen(true)}
        onResetAll={resetAllTransforms}
        onExpand={() => {}}
        onOpenFilePicker={openAttachmentUploadModal}
        onDownloadSelectedAttachment={() => {
          const first = controller.selectedAttachments[0];
          if (first) {
            void controller.downloadAttachment(first);
          }
        }}
        onCreateRow={() => void controller.createRow()}
        onDeleteRow={() => void controller.deleteRow(controller.selectedRecord)}
        canUploadToCell={Boolean(canUploadToCell)}
        canDownloadFromCell={canDownloadFromCell}
        isAttachmentWidgetDismissed={isAttachmentWidgetDismissed}
        onAttachmentWidgetClose={() => setIsAttachmentWidgetDismissed(true)}
        onOpenAttachmentUpload={openAttachmentUploadModal}
        onDownloadAllAttachments={() => void downloadAllAttachments()}
        onRefresh={() => void controllerRef.current?.loadEmbed()}
        onCanvasKeyDown={(event: React.KeyboardEvent<HTMLCanvasElement>) => {
          if (
            !controller.selection ||
            controller.editingCell ||
            controller.editingSelectCell ||
            event.target instanceof HTMLInputElement ||
            event.target instanceof HTMLTextAreaElement ||
            event.target instanceof HTMLSelectElement
          ) {
            return;
          }

          if (isDirectEditKey(event)) {
            event.preventDefault();
            event.stopPropagation();
            controller.canvasRef.current?.focus();
            controller.beginEdit(controller.selection, {
              replaceValue: event.key
            });
          }
        }}
      />
      <AttachmentUploadModal
        isOpen={isAttachmentUploadModalOpen}
        isSubmitting={controller.isMutating}
        files={attachmentUploadFiles}
        errorMessage={attachmentUploadError}
        onClose={closeAttachmentUploadModal}
        onFilesSelect={(files) => {
          setAttachmentUploadError('');
          setAttachmentUploadFiles((current) => [...current, ...files]);
        }}
        onRemoveFile={(index) =>
          setAttachmentUploadFiles((current) =>
            current.filter((_, currentIndex) => currentIndex !== index)
          )
        }
        onSubmit={() => {
          if (!controller.selectedRecord || !controller.selectedField) {
            setAttachmentUploadError('Сначала выберите ячейку вложений');
            return;
          }

          if (controller.selectedField.type !== 'Attachment') {
            setAttachmentUploadError(
              'Загрузка файлов доступна только для поля вложений'
            );
            return;
          }

          void controller
            .uploadAttachments(
              controller.selectedRecord,
              controller.selectedField,
              attachmentUploadFiles
            )
            .then(() => {
              closeAttachmentUploadModal();
            });
        }}
      />
    </NodeViewWrapper>
  );
}
