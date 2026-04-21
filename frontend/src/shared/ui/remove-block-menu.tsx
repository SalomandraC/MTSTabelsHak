import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type RemoveBlockMenuProps = {
  isOpen: boolean;
  position: {
    x: number;
    y: number;
  } | null;
  label: string;
  onClose: () => void;
  onConfirm: () => void;
  confirmIcon?: ReactNode;
};

export function RemoveBlockMenu({
  isOpen,
  position,
  label,
  onClose,
  onConfirm,
  confirmIcon,
}: RemoveBlockMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen || !position) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && menuRef.current?.contains(target)) {
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
      ref={menuRef}
      data-remove-block-menu="true"
      className="fixed z-[90] min-w-[220px] rounded-xl border border-editor-border-subtle bg-white p-1.5 shadow-[0_14px_32px_rgba(17,25,40,0.2)]"
      style={{ left: position.x, top: position.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium text-[#c62828] transition-colors hover:bg-[#fff1f1]"
        onClick={onConfirm}
      >
        <span>{label}</span>
        {confirmIcon ? <span className="text-[#d70032]">{confirmIcon}</span> : null}
      </button>
    </div>,
    document.body,
  );
}