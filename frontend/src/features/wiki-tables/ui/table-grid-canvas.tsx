import type { MwsTableEmbedController } from '../model/use-wiki-table-embed';
import {
  COLUMN_WIDTH,
  fieldInputType,
  getFieldValue,
  HEADER_HEIGHT,
  INDEX_WIDTH,
  MAX_GRID_HEIGHT,
  MIN_GRID_HEIGHT,
  renderCell,
  ROW_HEIGHT,
} from '../model/use-wiki-table-embed';
import { Check, ChevronsUpDown } from 'lucide-react';

export type TableGridProps = {
  controller: MwsTableEmbedController;
  isExpanded?: boolean;
  selectColorToCss: (color: string) => string;
};

export function TableGridCanvas({
  controller,
  selectColorToCss,
  onCanvasKeyDown,
  selectEditorRef,
}: TableGridProps & {
  onCanvasKeyDown: (event: React.KeyboardEvent<HTMLCanvasElement>) => void;
  selectEditorRef: React.RefObject<HTMLDivElement>;
}) {
  const canDrawBehindScrollbar = false;
  const maxHeight = canDrawBehindScrollbar ? 10000 : Math.min(MAX_GRID_HEIGHT, Math.max(MIN_GRID_HEIGHT, controller.gridHeight));

  return (
    <div
      ref={controller.scrollRef}
      onScroll={controller.handleCanvasScroll}
      className="relative overflow-auto rounded-lg border border-editor-border-subtle bg-white"
      style={{ height: maxHeight }}
    >
      <div
        className="relative"
        style={{
          width: Math.max(controller.gridWidth, controller.viewport.width),
          height: Math.max(controller.gridHeight, controller.viewport.height),
        }}
      >
        <div
          style={{
            width: Math.max(controller.gridWidth, controller.viewport.width),
            height: Math.max(controller.gridHeight, controller.viewport.height),
          }}
        />
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
          onKeyDown={onCanvasKeyDown}
          tabIndex={0}
        />
        {controller.editingCell ? (
          <input
            autoFocus
            value={controller.editingCell.value}
            type={fieldInputType(controller.visibleFields[controller.editingCell.fieldIndex])}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              controller.setEditingCell((current: any) => (current ? { ...current, value: event.target.value } : current))
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
              height: controller.editingCell.height - 4,
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
              {controller.editingSelectCell.options.map((option: any) => {
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
  );
}
