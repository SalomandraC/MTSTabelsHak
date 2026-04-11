import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import {
  Columns3,
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
import { useEffect } from 'react';

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
      className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm text-[#3f3f46] transition-colors hover:bg-[#edf0f5] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function MwsTableEmbedComponent({ node, selected }: NodeViewProps) {
  const controller = useWikiTableEmbed(node.attrs);

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

        const value = renderCell(getFieldValue(record, field));
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
            {controller.embed?.node.name ?? controller.attrs.title ?? controller.attrs.datasheetId ?? 'Таблица'}
          </h3>
          <p className="mt-1 text-xs text-editor-text-tertiary">
            {controller.embed?.view?.name ? `view: ${controller.embed.view.name}` : 'default view'} · {controller.records.length}/{controller.total} строк
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

      <div className="flex h-11 items-center gap-1 overflow-x-auto border-b border-editor-border-subtle bg-[#f5f6f8] px-2">
        <ToolbarButton label="" icon={<RotateCcw className="h-4 w-4" />} disabled />
        <ToolbarButton label="" icon={<RotateCw className="h-4 w-4" />} disabled />
        <div className="mx-1 h-6 w-px bg-[#dfe3ea]" />
        <ToolbarButton label="Вставить запись" icon={<PlusCircle className="h-4 w-4" />} onClick={() => void controller.createRow()} disabled={!controller.capabilities.canCreateRecords || controller.isMutating || controller.fields.length === 0} />
        <ToolbarButton label="Скрыть поля" icon={<EyeOff className="h-4 w-4" />} disabled />
        <ToolbarButton label="Фильтр" icon={<Filter className="h-4 w-4" />} disabled />
        <ToolbarButton label="Группа" icon={<Group className="h-4 w-4" />} disabled />
        <ToolbarButton label="Сортировка" icon={<SortAsc className="h-4 w-4" />} disabled />
        <ToolbarButton label="Удалить строку" icon={<Trash2 className="h-4 w-4" />} onClick={() => void controller.deleteRow(controller.selectedRecord)} disabled={!controller.selectedRecord || !controller.capabilities.canDeleteRecords || controller.isMutating} />
        <ToolbarButton label="Обновить" icon={<RefreshCw className="h-4 w-4" />} onClick={() => void controller.loadEmbed()} disabled={controller.isLoading} />
        <div className="ml-auto flex h-8 shrink-0 items-center gap-1 rounded-md border border-[#dfe3ea] bg-white px-2">
          <Search className="h-4 w-4 text-[#626a75]" />
          <input
            value={controller.searchQuery}
            onChange={(event) => {
              controller.setSearchQuery(event.target.value);
              controller.setSelection(null);
              controller.setEditingCell(null);
            }}
            placeholder="Найти"
            className="h-7 w-28 border-0 bg-transparent text-sm outline-none"
          />
        </div>
        <ToolbarButton label="Структура" icon={<Columns3 className="h-4 w-4" />} disabled />
        <ToolbarButton label="Дополнительно" icon={<Settings className="h-4 w-4" />} disabled />
      </div>

      <div className="p-4">
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
                  const nextSelection = controller.hitTest(event);
                  controller.setSelection(nextSelection);
                  controller.setEditingCell(null);
                }}
                onDoubleClick={(event) => controller.beginEdit(controller.hitTest(event))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    controller.beginEdit(controller.selection);
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
    </NodeViewWrapper>
  );
}
