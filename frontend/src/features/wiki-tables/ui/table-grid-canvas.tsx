import type { MwsTableEmbedController } from '../model/use-wiki-table-embed';
import {
  ADD_COLUMN_WIDTH,
  ADD_ROW_HEIGHT,
  COLUMN_WIDTH,
  fieldInputType,
  HEADER_HEIGHT,
  INDEX_WIDTH,
  ROW_HEIGHT
} from '../model/use-wiki-table-embed';
import { Check, ChevronsUpDown, Download, Paperclip, X } from 'lucide-react';
import { ScrollArea } from '../../../shared/ui';
import { resolveTableGridHeight } from './table-grid-layout';

export type TableGridProps = {
  controller: MwsTableEmbedController;
  isExpanded?: boolean;
  selectColorToCss: (color: string) => string;
};

export function TableGridCanvas({
  controller,
  isExpanded = false,
  selectColorToCss,
  onCanvasKeyDown,
  selectEditorRef,
  isAttachmentWidgetDismissed = false,
  onAttachmentWidgetClose,
  onAddColumn,
  onAddRow,
  onOpenAttachmentUpload,
  onDownloadAllAttachments
}: TableGridProps & {
  onCanvasKeyDown: (event: React.KeyboardEvent<HTMLCanvasElement>) => void;
  selectEditorRef: React.RefObject<HTMLDivElement>;
  isAttachmentWidgetDismissed?: boolean;
  onAttachmentWidgetClose?: () => void;
  onAddColumn?: () => void;
  onAddRow?: () => void;
  onOpenAttachmentUpload?: () => void;
  onDownloadAllAttachments?: () => void;
}) {
  const gridHeight = resolveTableGridHeight(controller.gridHeight, isExpanded);
  const selectedAttachmentCell =
    controller.selection &&
    controller.selectedField?.type === 'Attachment' &&
    controller.selectedRecord
      ? {
          left:
            INDEX_WIDTH +
            controller.selection.fieldIndex * COLUMN_WIDTH -
            controller.scrollOffset.left +
            2,
          top:
            HEADER_HEIGHT +
            controller.selection.rowIndex * ROW_HEIGHT -
            controller.scrollOffset.top +
            ROW_HEIGHT +
            6
        }
      : null;

  return (
    <ScrollArea
      ref={controller.registerScrollElement}
      onScroll={controller.handleCanvasScroll}
      variant="table"
      className={[
        'relative overflow-auto bg-white',
        isExpanded ? 'min-h-0 flex-1' : ''
      ].join(' ')}
      style={{ height: gridHeight }}
    >
      <div
        className="relative"
        style={{
          width: Math.max(controller.gridWidth, controller.viewport.width),
          height: Math.max(controller.gridHeight, controller.viewport.height)
        }}
      >
        <div
          style={{
            width: Math.max(controller.gridWidth, controller.viewport.width),
            height: Math.max(controller.gridHeight, controller.viewport.height)
          }}
        />
        <canvas
          ref={controller.canvasRef}
          data-testid={
            isExpanded ? 'mws_canvas_grid_expanded' : 'mws_canvas_grid'
          }
          className="absolute left-0 top-0 block cursor-cell bg-transparent"
          style={{
            transform: `translate(${controller.scrollOffset.left}px, ${controller.scrollOffset.top}px)`
          }}
          onPointerDown={(event) => {
            event.currentTarget.focus();
            const rect = event.currentTarget.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            const addColumnStart =
              INDEX_WIDTH +
              controller.visibleFields.length * COLUMN_WIDTH -
              controller.scrollOffset.left;
            const addColumnEnd = addColumnStart + ADD_COLUMN_WIDTH;
            const addRowStart =
              HEADER_HEIGHT +
              controller.visibleRows.length * ROW_HEIGHT -
              controller.scrollOffset.top;
            const addRowEnd = addRowStart + ADD_ROW_HEIGHT;

            if (
              onAddColumn &&
              y >= 0 &&
              y <= HEADER_HEIGHT &&
              x >= addColumnStart &&
              x <= addColumnEnd
            ) {
              onAddColumn();
              return;
            }

            if (
              onAddRow &&
              x >= 0 &&
              x <= INDEX_WIDTH &&
              y >= addRowStart &&
              y <= addRowEnd
            ) {
              onAddRow();
              return;
            }

            const nextSelection = controller.hitTest(event);
            controller.setSelection(nextSelection);
            controller.setEditingCell(null);
            controller.setEditingSelectCell(null);
            controller.beginEdit(nextSelection, { fromSingleClick: true });
          }}
          onDoubleClick={(event) =>
            controller.beginEdit(controller.hitTest(event))
          }
          onKeyDown={onCanvasKeyDown}
          tabIndex={0}
        />
        {controller.editingCell ? (
          <input
            autoFocus
            value={controller.editingCell.value}
            type={fieldInputType(
              controller.visibleFields[controller.editingCell.fieldIndex]
            )}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              controller.setEditingCell((current: any) =>
                current ? { ...current, value: event.target.value } : current
              )
            }
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
              height: controller.editingCell.height - 4
            }}
          />
        ) : null}
        {controller.editingSelectCell ? (
          <div
            data-testid="mws_select_editor"
            ref={selectEditorRef}
            className="absolute z-30 overflow-hidden rounded-lg border border-[#d9deea] bg-white shadow-[0_10px_28px_rgba(17,24,39,0.18)]"
            style={{
              left: controller.editingSelectCell.left + 2,
              top: controller.editingSelectCell.top + 2,
              width: Math.max(controller.editingSelectCell.width - 4, 220)
            }}
          >
            <div className="flex items-center justify-between border-b border-editor-border-subtle px-2 py-1.5 text-xs text-editor-text-tertiary">
              <span>
                {controller.editingSelectCell.multiple
                  ? 'Множественный выбор'
                  : 'Одиночный выбор'}
              </span>
              <button
                type="button"
                onClick={() => controller.clearSelectValue()}
                className="rounded px-1.5 py-0.5 text-[#667085] hover:bg-[#f3f4f6]"
              >
                Очистить
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto p-1.5">
              {controller.editingSelectCell.options.map((option: any) => {
                const isSelected =
                  controller.editingSelectCell?.values.includes(option.name);

                return (
                  <button
                    key={option.name}
                    type="button"
                    onClick={() => controller.applySelectValue(option.name)}
                    className={[
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                      isSelected
                        ? 'bg-[#eef2ff] text-[#1f2a44]'
                        : 'text-editor-text-primary hover:bg-[#f4f6fb]'
                    ].join(' ')}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{
                        backgroundColor: selectColorToCss(option.color)
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {option.name}
                    </span>
                    {isSelected ? (
                      <Check className="h-3.5 w-3.5 text-[#4f46e5]" />
                    ) : (
                      <ChevronsUpDown className="h-3.5 w-3.5 text-[#98a2b3]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        {selectedAttachmentCell && !isAttachmentWidgetDismissed ? (
          <div
            data-testid="mws_attachment_widget"
            className="absolute z-30 overflow-hidden rounded-xl border border-[#e6ebf3] bg-white shadow-[0_16px_40px_rgba(17,24,39,0.16)]"
            style={{
              left: Math.max(8, selectedAttachmentCell.left),
              top: Math.max(HEADER_HEIGHT + 8, selectedAttachmentCell.top),
              width: 320
            }}
          >
            <div className="flex items-center justify-between border-b border-[#eef2f7] px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-editor-text-tertiary">
                  Вложения ячейки
                </p>
                <p className="truncate text-xs text-[#7b8190]">
                  {controller.selectedAttachments.length > 0
                    ? `${controller.selectedAttachments.length} файл(ов)`
                    : 'Файлы не добавлены'}
                </p>
              </div>
              <button
                type="button"
                onClick={onAttachmentWidgetClose}
                className="rounded-md p-1 text-[#667085] transition-colors hover:bg-[#f3f6fb]"
                aria-label="Закрыть виджет вложений"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {controller.selectedAttachments.length > 0 ? (
              <div className="max-h-56 overflow-y-auto p-2">
                <div className="mb-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onOpenAttachmentUpload}
                    className="inline-flex items-center gap-1 rounded-md border border-editor-border-control px-2 py-1 text-xs font-semibold text-editor-text-primary"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    Добавить файл
                  </button>
                  <button
                    type="button"
                    onClick={onDownloadAllAttachments}
                    className="inline-flex items-center gap-1 rounded-md border border-editor-border-control px-2 py-1 text-xs font-semibold text-editor-text-primary"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Скачать все
                  </button>
                </div>
                <div className="grid gap-2">
                  {controller.selectedAttachments.map((item, index) => (
                    <div
                      key={`${item.name}-${index}`}
                      className="flex items-center gap-2 rounded-lg border border-[#eef2f7] bg-[#fbfcfe] px-2.5 py-2"
                    >
                      <Paperclip className="h-4 w-4 shrink-0 text-[#667085]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-editor-text-primary">
                          {item.name}
                        </p>
                        <p className="text-xs text-editor-text-tertiary">
                          Вложение из MWS Tables
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void controller.downloadAttachment(item)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-editor-border-control px-2 py-1 text-xs font-semibold text-editor-text-primary"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Скачать
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="px-3 py-3">
                <p className="mb-3 text-sm text-editor-text-tertiary">
                  В этой ячейке нет вложений.
                </p>
                <button
                  type="button"
                  onClick={onOpenAttachmentUpload}
                  className="inline-flex items-center gap-1 rounded-md border border-editor-border-control px-2 py-1.5 text-xs font-semibold text-editor-text-primary"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  Загрузить файл
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </ScrollArea>
  );
}
