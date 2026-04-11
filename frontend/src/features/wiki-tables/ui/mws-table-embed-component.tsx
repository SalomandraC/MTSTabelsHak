import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import {
  Check,
  Paperclip,
  Columns3,
  ChevronsUpDown,
  Download,
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
import { useEffect, useRef, useState } from 'react';

import { CreateFieldModal } from './create-field-modal';
import {
  clampText,
  COLUMN_WIDTH,
  fieldInputType,
  getFieldValue,
  HEADER_HEIGHT,
  INDEX_WIDTH,
  MAX_GRID_HEIGHT,
  MIN_GRID_HEIGHT,
  renderCell,
  ROW_HEIGHT,
  useWikiTableEmbed,
} from '../model/use-wiki-table-embed';

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
      className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-sm text-[#3f3f46] transition-colors hover:bg-[#edf0f5] disabled:cursor-not-allowed disabled:opacity-40 [&>svg]:h-4 [&>svg]:w-4"
    >
      {icon}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

function isDirectEditKey(event: React.KeyboardEvent<HTMLElement>) {
  return event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey;
}

export function MwsTableEmbedComponent({ node, selected }: NodeViewProps) {
  const controller = useWikiTableEmbed(node.attrs);
  const [isCreateFieldModalOpen, setIsCreateFieldModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectEditorRef = useRef<HTMLDivElement | null>(null);

  const selectColorToCss = (color: string) => {
    const palette: Record<string, string> = {
      red: '#ef4444',
      orange: '#f97316',
      yellow: '#f59e0b',
      green: '#22c55e',
      teal: '#14b8a6',
      blue: '#3b82f6',
      purple: '#8b5cf6',
      gray: '#6b7280',
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

    controller.fields.forEach((field, fieldIndex) => {
      const x = INDEX_WIDTH + fieldIndex * COLUMN_WIDTH - controller.scrollOffset.left;
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

    const firstRow = Math.max(0, Math.floor((controller.scrollOffset.top - HEADER_HEIGHT) / ROW_HEIGHT));
    const lastRow = Math.min(
      controller.visibleRecords.length - 1,
      Math.ceil((controller.scrollOffset.top + height - HEADER_HEIGHT) / ROW_HEIGHT),
    );

    for (let rowIndex = firstRow; rowIndex <= lastRow; rowIndex += 1) {
      const record = controller.visibleRecords[rowIndex];
      if (!record) {
        continue;
      }

      const y = HEADER_HEIGHT + rowIndex * ROW_HEIGHT - controller.scrollOffset.top;
      const isSelectedRow = controller.selection?.rowIndex === rowIndex;

      ctx.fillStyle = isSelectedRow ? '#f4f2ff' : rowIndex % 2 === 0 ? '#ffffff' : '#fbfcfe';
      ctx.fillRect(0, y, width, ROW_HEIGHT);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, y, INDEX_WIDTH, ROW_HEIGHT);
      ctx.fillStyle = '#555b66';
      ctx.fillText(String(rowIndex + 1), 22, y + ROW_HEIGHT / 2);

      controller.fields.forEach((field, fieldIndex) => {
        const x = INDEX_WIDTH + fieldIndex * COLUMN_WIDTH - controller.scrollOffset.left;
        if (x + COLUMN_WIDTH < INDEX_WIDTH || x > width) {
          return;
        }

        const isSelected = controller.selection?.rowIndex === rowIndex && controller.selection.fieldIndex === fieldIndex;
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

    if (controller.visibleRecords.length === 0) {
      ctx.fillStyle = '#7b8190';
      ctx.fillText('Нет строк для отображения', INDEX_WIDTH + 16, HEADER_HEIGHT + ROW_HEIGHT / 2);
    }
  }, [controller.canvasRef, controller.fields, controller.scrollOffset.left, controller.scrollOffset.top, controller.selection, controller.viewport.height, controller.viewport.width, controller.visibleRecords]);

  useEffect(() => {
    if (!controller.selection || controller.editingCell || controller.editingSelectCell || !controller.canvasRef.current) {
      return;
    }

    controller.canvasRef.current.focus();
  }, [controller.canvasRef, controller.editingCell, controller.editingSelectCell, controller.selection]);

  useEffect(() => {
    if (!controller.editingSelectCell) {
      return;
    }

    const handlePointerDownOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (selectEditorRef.current?.contains(target) || controller.canvasRef.current?.contains(target)) {
        return;
      }

      controller.setEditingSelectCell(null);
    };

    document.addEventListener('pointerdown', handlePointerDownOutside);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutside);
    };
  }, [controller.canvasRef, controller.editingSelectCell, controller.setEditingSelectCell]);

  const canUploadToCell = controller.selectedRecord && controller.selectedField?.type === 'Attachment';
  const canDownloadFromCell = controller.selectedField?.type === 'Attachment' && controller.selectedAttachments.length > 0;
  const downloadAllAttachments = async () => {
    for (const attachment of controller.selectedAttachments) {
      // Sequential downloads avoid browser popup throttling and preserve filename handling.
      await controller.downloadAttachment(attachment);
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
      onKeyDownCapture={(event: React.KeyboardEvent<HTMLDivElement>) => {
        if (!controller.selection || controller.editingCell || controller.editingSelectCell || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) {
          return;
        }

        if (isDirectEditKey(event)) {
          event.preventDefault();
          event.stopPropagation();
          controller.canvasRef.current?.focus();
          controller.beginEdit(controller.selection, { replaceValue: event.key });
        }
      }}
    >
      <div className="flex items-start justify-between gap-1 border-b border-editor-border-subtle bg-[#f8fafc] px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] text-editor-text-tertiary">
            {controller.updatedAgoSec === null ? 'Синхронизация...' : `Обновлено ${controller.updatedAgoSec} сек назад`}
            {controller.nextRefreshInSec !== null ? ` · Следующее обновление через ${controller.nextRefreshInSec} сек` : ''}
          </p>
          <h2 className="truncate font-wide text-base font-semibold text-editor-text-primary leading-none">
            {controller.embed?.node.name ?? controller.attrs.title ?? controller.attrs.datasheetId ?? 'Таблица'}
          </h2>
          <p className="text-xs text-editor-text-tertiary">
            {controller.embed?.view?.name ? `${controller.embed.view.name}` : 'default view'} · {controller.records.length}/{controller.total} строк
          </p>
        </div>
        {controller.embed?.openInMwsUrl ? (
          <a
            href={controller.embed.openInMwsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-editor-border-control px-3 py-1.5 text-xs font-semibold text-editor-text-primary"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Открыть в MWS
          </a>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-editor-border-subtle bg-[#f5f6f8] px-2 py-2">
        <ToolbarButton label="" icon={<RotateCcw className="h-4 w-4" />} disabled />
        <ToolbarButton label="" icon={<RotateCw className="h-4 w-4" />} disabled />
        <div className="mx-1 h-6 w-px bg-[#dfe3ea]" />
        <ToolbarButton label="Вставить запись" icon={<PlusCircle className="h-4 w-4" />} onClick={() => void controller.createRow()} disabled={!controller.capabilities.canCreateRecords || controller.isMutating || controller.fields.length === 0} />
        <ToolbarButton label="Столбец" icon={<Columns3 className="h-4 w-4" />} onClick={() => setIsCreateFieldModalOpen(true)} disabled={controller.isMutating} />
        <ToolbarButton label="Файл" icon={<Paperclip className="h-4 w-4" />} onClick={() => fileInputRef.current?.click()} disabled={!canUploadToCell || controller.isMutating} />
        <ToolbarButton
          label="Скачать файл"
          icon={<Download className="h-4 w-4" />}
          onClick={() => {
            const first = controller.selectedAttachments[0];
            if (first) {
              void controller.downloadAttachment(first);
            }
          }}
          disabled={!canDownloadFromCell || controller.isMutating}
        />
        <ToolbarButton label="Скрыть поля" icon={<EyeOff className="h-4 w-4" />} disabled />
        <ToolbarButton label="Фильтр" icon={<Filter className="h-4 w-4" />} disabled />
        <ToolbarButton label="Группа" icon={<Group className="h-4 w-4" />} disabled />
        <ToolbarButton label="Сортировка" icon={<SortAsc className="h-4 w-4" />} disabled />
        <ToolbarButton label="Удалить строку" icon={<Trash2 className="h-4 w-4" />} onClick={() => void controller.deleteRow(controller.selectedRecord)} disabled={!controller.selectedRecord || !controller.capabilities.canDeleteRecords || controller.isMutating} />
        <ToolbarButton label="Обновить" icon={<RefreshCw className="h-4 w-4" />} onClick={() => void controller.loadEmbed()} disabled={controller.isLoading} />
        <div className="flex h-8 shrink-0 items-center gap-1 rounded-md border border-[#dfe3ea] bg-white px-2">
          <Search className="h-4 w-4 text-[#626a75]" />
          <input
            value={controller.searchQuery}
            onChange={(event) => {
              controller.setSearchQuery(event.target.value);
              controller.setSelection(null);
              controller.setEditingCell(null);
              controller.setEditingSelectCell(null);
            }}
            placeholder="Найти"
            className="h-7 w-28 border-0 bg-transparent text-sm outline-none"
          />
        </div>
        <ToolbarButton label="Дополнительно" icon={<Settings className="h-4 w-4" />} disabled />
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            if (file && controller.selectedRecord && controller.selectedField) {
              void controller.uploadAttachment(controller.selectedRecord, controller.selectedField, file);
            }

            event.currentTarget.value = '';
          }}
        />
      </div>

      <div className="p-4">
        {controller.selectedField?.type === 'Attachment' ? (
          <div className="mb-3 rounded-lg border border-editor-border-subtle bg-[#f8fafc] p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-editor-text-tertiary">Вложения ячейки</p>
              <button
                type="button"
                onClick={() => void downloadAllAttachments()}
                disabled={!canDownloadFromCell || controller.isMutating}
                className="inline-flex items-center gap-1 rounded-md border border-editor-border-control px-2 py-1 text-xs font-semibold text-editor-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                Скачать все
              </button>
            </div>
            {controller.selectedAttachments.length > 0 ? (
              <div className="mt-2 grid gap-2">
                {controller.selectedAttachments.map((item, index) => (
                  <div key={`${item.name}-${index}`} className="flex items-center gap-2 rounded-md border border-editor-border-subtle bg-white px-2 py-1.5">
                    <Paperclip className="h-4 w-4 text-[#667085]" />
                    <span className="min-w-0 flex-1 truncate text-sm text-editor-text-primary">{item.name}</span>
                    <button
                      type="button"
                      onClick={() => void controller.downloadAttachment(item)}
                      className="inline-flex items-center gap-1 rounded-md border border-editor-border-control px-2 py-1 text-xs font-semibold text-editor-text-primary"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Скачать
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-editor-text-tertiary">В этой ячейке нет вложений</p>
            )}
          </div>
        ) : null}
        {controller.isLoading && controller.records.length === 0 ? <div className="rounded-lg bg-[#f3f6fb] p-4 text-sm text-editor-text-tertiary">Загружаем живую таблицу...</div> : null}
        {!controller.isLoading && controller.errorMessage ? (
          <div className="rounded-lg border border-[#ffd2d9] bg-[#fff1f3] p-4 text-sm text-[#b00025]">{controller.errorMessage}</div>
        ) : null}
        {controller.staleMessage ? (
          <div className="mb-3 rounded-lg border border-[#ffe0a3] bg-[#fff8e6] p-3 text-sm text-[#8a5a00]">
            Показываем последние загруженные данные. {controller.staleMessage}
          </div>
        ) : null}
        {!controller.isLoading && !controller.errorMessage && controller.records.length === 0 ? (
          <div className="rounded-lg bg-[#f3f6fb] p-4 text-sm text-editor-text-tertiary">В выбранном view пока нет строк</div>
        ) : null}
        {!controller.errorMessage && controller.records.length > 0 ? (
          <div
            ref={controller.scrollRef}
            onScroll={controller.handleCanvasScroll}
            className="relative overflow-auto rounded-lg border border-editor-border-subtle bg-white"
            style={{ height: Math.min(MAX_GRID_HEIGHT, Math.max(MIN_GRID_HEIGHT, controller.gridHeight)) }}
          >
            <div className="relative" style={{ width: Math.max(controller.gridWidth, controller.viewport.width), height: Math.max(controller.gridHeight, controller.viewport.height) }}>
              <div style={{ width: Math.max(controller.gridWidth, controller.viewport.width), height: Math.max(controller.gridHeight, controller.viewport.height) }} />
              <canvas
                ref={controller.canvasRef}
                data-testid="mws_canvas_grid"
                className="absolute left-0 top-0 block cursor-cell bg-transparent"
                style={{
                  transform: `translate(${controller.scrollOffset.left}px, ${controller.scrollOffset.top}px)`,
                }}
                onPointerDown={(event) => {
                  event.currentTarget.focus();
                  const nextSelection = controller.hitTest(event);
                  controller.setSelection(nextSelection);
                  controller.setEditingCell(null);
                  controller.setEditingSelectCell(null);
                  controller.beginEdit(nextSelection, { fromSingleClick: true });
                }}
                onDoubleClick={(event) => controller.beginEdit(controller.hitTest(event))}
                onKeyDown={(event) => {
                  if (!controller.selection) {
                    return;
                  }

                  if (isDirectEditKey(event)) {
                    event.preventDefault();
                    event.stopPropagation();
                    controller.beginEdit(controller.selection, { replaceValue: event.key });
                    return;
                  }

                  if (event.key === 'Enter') {
                    event.preventDefault();
                    event.stopPropagation();
                    controller.beginEdit(controller.selection);
                    return;
                  }

                  if (event.key === 'Backspace' || event.key === 'Delete') {
                    event.preventDefault();
                    event.stopPropagation();
                    if (controller.editingSelectCell) {
                      controller.clearSelectValue();
                      return;
                    }
                    controller.beginEdit(controller.selection, { replaceValue: '' });
                  }

                  if (event.key === 'Escape' && controller.editingSelectCell) {
                    event.preventDefault();
                    event.stopPropagation();
                    controller.setEditingSelectCell(null);
                  }
                }}
                tabIndex={0}
              />
              {controller.editingCell ? (
                <input
                  autoFocus
                  value={controller.editingCell.value}
                  type={fieldInputType(controller.fields[controller.editingCell.fieldIndex])}
                  onChange={(event) => controller.setEditingCell((current) => (current ? { ...current, value: event.target.value } : current))}
                  onBlur={controller.commitEdit}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      controller.commitEdit();
                    }

                    if (event.key === 'Escape') {
                      event.preventDefault();
                      controller.setEditingCell(null);
                    }
                  }}
                  className="absolute z-20 rounded border border-[#7b67ee] bg-white px-2 text-sm outline-none shadow-sm"
                  style={{
                    left: controller.editingCell.left + 2,
                    top: controller.editingCell.top + 2,
                    width: controller.editingCell.width - 4,
                    height: controller.editingCell.height - 4,
                  }}
                />
              ) : null}
              {controller.editingSelectCell ? (
                <div
                  ref={selectEditorRef}
                  data-testid="mws_select_editor"
                  className="absolute z-30 overflow-hidden rounded-lg border border-[#d9deea] bg-white shadow-[0_10px_28px_rgba(17,24,39,0.18)]"
                  style={{
                    left: controller.editingSelectCell.left + 2,
                    top: controller.editingSelectCell.top + 2,
                    width: Math.max(controller.editingSelectCell.width - 4, 220),
                  }}
                >
                  <div className="flex items-center justify-between border-b border-editor-border-subtle px-2 py-1.5 text-xs text-editor-text-tertiary">
                    <span>{controller.editingSelectCell.multiple ? 'Множественный выбор' : 'Одиночный выбор'}</span>
                    <button
                      type="button"
                      onClick={() => controller.clearSelectValue()}
                      className="rounded px-1.5 py-0.5 text-[#667085] hover:bg-[#f3f4f6]"
                    >
                      Очистить
                    </button>
                  </div>
                  <div className="max-h-56 overflow-y-auto p-1.5">
                    {controller.editingSelectCell.options.map((option) => {
                      const isSelected = controller.editingSelectCell?.values.includes(option.name);

                      return (
                        <button
                          key={option.name}
                          type="button"
                          onClick={() => controller.applySelectValue(option.name)}
                          className={[
                            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                            isSelected ? 'bg-[#eef2ff] text-[#1f2a44]' : 'text-editor-text-primary hover:bg-[#f4f6fb]',
                          ].join(' ')}
                        >
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: selectColorToCss(option.color) }} />
                          <span className="min-w-0 flex-1 truncate">{option.name}</span>
                          {isSelected ? <Check className="h-3.5 w-3.5 text-[#4f46e5]" /> : <ChevronsUpDown className="h-3.5 w-3.5 text-[#98a2b3]" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {controller.hasMore ? (
          <button
            type="button"
            onClick={() => void controller.loadNextPage()}
            disabled={controller.isMutating}
            className="mt-3 h-10 rounded-lg border border-editor-border-control px-4 text-sm font-semibold text-editor-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Загрузить еще
          </button>
        ) : null}
      </div>
      <CreateFieldModal
        isOpen={isCreateFieldModalOpen}
        isSubmitting={controller.isMutating}
        onClose={() => setIsCreateFieldModalOpen(false)}
        onSubmit={(payload) => {
          void controller.createField(payload).then(() => setIsCreateFieldModalOpen(false));
        }}
      />
    </NodeViewWrapper>
  );
}
