import { X } from 'lucide-react';
import type { MwsTableEmbedController } from '../model/use-wiki-table-embed';
import { TableGridCanvas } from './table-grid-canvas';

export type ExpandedTableModalProps = {
  isOpen: boolean;
  controller: MwsTableEmbedController;
  tableTitle: string;
  selectColorToCss: (color: string) => string;
  selectEditorRef: React.RefObject<HTMLDivElement>;
  onClose: () => void;
  onCanvasKeyDown: (event: React.KeyboardEvent<HTMLCanvasElement>) => void;
  onCanvasPointerDown?: (event: React.PointerEvent<HTMLCanvasElement>) => void;
};

export function ExpandedTableModal({
  isOpen,
  controller,
  tableTitle,
  selectColorToCss,
  selectEditorRef,
  onClose,
  onCanvasKeyDown,
}: ExpandedTableModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
      onMouseDown={onClose}
      onClick={onClose}
    >
      <div
        className="flex flex-col w-full h-full max-w-6xl max-h-[90vh] bg-white rounded-lg shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-editor-border-subtle bg-[#f8fafc] px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-wide text-lg font-semibold text-editor-text-primary leading-none">
              {tableTitle}
            </h2>
            <p className="text-xs text-editor-text-tertiary mt-1">
              Полноэкранный просмотр
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-editor-text-secondary hover:bg-white transition-colors"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden">
          <TableGridCanvas
            controller={controller}
            selectColorToCss={selectColorToCss}
            onCanvasKeyDown={onCanvasKeyDown}
            selectEditorRef={selectEditorRef}
          />
        </div>
      </div>
    </div>
  );
}
