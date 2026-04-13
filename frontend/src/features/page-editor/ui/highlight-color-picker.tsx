import type { Editor } from '@tiptap/core';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

type HighlightColorPickerProps = {
  editor: Editor;
  isOpen: boolean;
  anchorRect: DOMRect | null;
  toolbarRef?: React.RefObject<HTMLDivElement> | null;
  onClose: () => void;
};

const HIGHLIGHT_COLORS = [
  { value: '#fef08a', label: 'Жёлтый' },
  { value: '#bbf7d0', label: 'Зелёный' },
  { value: '#bfdbfe', label: 'Синий' },
  { value: '#fecaca', label: 'Красный' },
  { value: '#e9d5ff', label: 'Фиолетовый' },
  { value: '#fed7aa', label: 'Оранжевый' },
];

const PICKER_HEIGHT = 52;
const PICKER_WIDTH = 160;
const GAP = 6;

export function HighlightColorPicker({
  editor,
  isOpen,
  anchorRect,
  toolbarRef = null,
  onClose,
}: HighlightColorPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !anchorRect) return null;

  // Считаем позицию прямо при рендере — без стейта
  let left = anchorRect.left;
  let top = anchorRect.top - PICKER_HEIGHT - GAP;

  if (top < 8) {
    top = anchorRect.bottom + GAP;
  }
  if (left + PICKER_WIDTH > window.innerWidth - 8) {
    left = window.innerWidth - PICKER_WIDTH - 8;
  }
  if (left < 8) {
    left = 8;
  }

  const handleColorSelect = (color: string) => {
    editor.chain().focus().setHighlight({ color }).run();
    onClose();
  };

  const handleRemoveHighlight = () => {
    editor.chain().focus().unsetHighlight().run();
    onClose();
  };

  return createPortal(
    <div
      ref={pickerRef}
      style={{ position: 'fixed', top, left, zIndex: 9999 }}
      className="w-[160px] rounded-lg border border-editor-border-control bg-white p-2 shadow-lg"
      role="dialog"
      aria-label="Выбор цвета выделения"
    >
      <div className="grid grid-cols-4 gap-1.5">
        <button
          type="button"
          onClick={handleRemoveHighlight}
          className="relative flex h-7 w-7 items-center justify-center overflow-hidden rounded border border-editor-border-control bg-white transition-all hover:scale-110 hover:border-editor-brand hover:shadow-sm"
          aria-label="Убрать выделение"
          title="Убрать выделение"
        >
          <svg viewBox="0 0 28 28" className="absolute inset-0 h-full w-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="hl-checker" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
                <rect x="0" y="0" width="4" height="4" fill="#f3f4f6" />
                <rect x="4" y="4" width="4" height="4" fill="#f3f4f6" />
              </pattern>
            </defs>
            <rect x="0" y="0" width="28" height="28" fill="url(#hl-checker)" />
            <line x1="2" y1="2" x2="26" y2="26" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        {HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color.value}
            type="button"
            onClick={() => handleColorSelect(color.value)}
            className="h-7 w-7 rounded border border-editor-border-control transition-all hover:scale-110 hover:border-editor-brand hover:shadow-sm"
            style={{ backgroundColor: color.value }}
            aria-label={color.label}
            title={color.label}
          />
        ))}
      </div>
    </div>,
    document.body,
  );
}
