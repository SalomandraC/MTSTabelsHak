import { createPortal } from 'react-dom';
import { useEffect, useRef } from 'react';

import { ModalActionButton } from '../../../shared/ui';

type DeleteRowConfirmPopoverProps = {
  isOpen: boolean;
  position: {
    x: number;
    y: number;
  } | null;
  rowNumber: number;
  onClose: () => void;
  onConfirm: () => void;
};

export function DeleteRowConfirmPopover({
  isOpen,
  position,
  rowNumber,
  onClose,
  onConfirm,
}: DeleteRowConfirmPopoverProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen || !position) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && popoverRef.current?.contains(target)) {
        return;
      }

      onClose();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose, position]);

  if (!isOpen || !position || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed z-[15] w-[280px] overflow-hidden rounded-2xl border border-[#f2c6cf] bg-white shadow-[0_18px_52px_rgba(17,25,40,0.18)]"
      style={{ left: position.x, top: position.y }}
      role="dialog"
      aria-modal="false"
      aria-label={`Удаление строки ${rowNumber}`}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="border-b border-[#f4d7dc] bg-[#fff7f8] px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#b00025]">
          Удаление строки
        </p>
        <p className="mt-1 text-sm font-semibold text-editor-text-primary">
          Удалить строку №{rowNumber}?
        </p>
      </div>

      <div className="px-4 py-3 text-sm text-editor-text-tertiary">
        Запись будет удалена из таблицы без возможности отмены.
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-[#f4d7dc] bg-[#fffafb] px-4 py-3">
        <ModalActionButton onClick={onClose} variant="secondary">
          Отмена
        </ModalActionButton>
        <ModalActionButton onClick={onConfirm} variant="primary">
          Удалить
        </ModalActionButton>
      </div>
    </div>,
    document.body,
  );
}