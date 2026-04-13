import { ArrowDownAZ, ArrowUpAZ, EyeOff, Filter, FolderTree } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect, useRef, type ReactNode } from 'react';

type FieldActionsMenuProps = {
  fieldName: string;
  position: {
    x: number;
    y: number;
  } | null;
  onClose: () => void;
  onSortAsc: () => void;
  onSortDesc: () => void;
  onAddFilter: () => void;
  onGroupAsc: () => void;
  onGroupDesc: () => void;
  onHideField: () => void;
};

type ActionButtonProps = {
  icon: ReactNode;
  label: string;
  onClick: () => void;
};

function ActionButton({ icon, label, onClick }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[#3f3f46] transition-colors hover:bg-[#f3f5fb]"
    >
      <span className="text-[#6b7280] [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export function FieldActionsMenu({
  fieldName,
  position,
  onClose,
  onSortAsc,
  onSortDesc,
  onAddFilter,
  onGroupAsc,
  onGroupDesc,
  onHideField
}: FieldActionsMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!position) {
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

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, position]);

  if (!position) {
    return null;
  }

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[230] w-72 overflow-hidden rounded-2xl border border-[#e3e8f1] bg-white p-2 shadow-[0_24px_70px_rgba(17,25,40,0.2)]"
      style={{
        left: Math.max(12, position.x),
        top: Math.max(12, position.y)
      }}
      role="menu"
      aria-label={`Действия для поля ${fieldName}`}
    >
      <div className="border-b border-[#eef2f7] px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-editor-text-tertiary">
          Поле
        </p>
        <p className="truncate text-sm font-semibold text-editor-text-primary">
          {fieldName}
        </p>
      </div>

      <div className="py-1">
        <ActionButton
          icon={<ArrowUpAZ />}
          label="Сортировать A → Я"
          onClick={() => {
            onSortAsc();
            onClose();
          }}
        />
        <ActionButton
          icon={<ArrowDownAZ />}
          label="Сортировать Я → A"
          onClick={() => {
            onSortDesc();
            onClose();
          }}
        />
      </div>

      <div className="border-t border-[#eef2f7] py-1">
        <ActionButton
          icon={<Filter />}
          label={`Добавить "${fieldName}" как фильтр`}
          onClick={() => {
            onAddFilter();
            onClose();
          }}
        />
      </div>

      <div className="border-t border-[#eef2f7] py-1">
        <ActionButton
          icon={<FolderTree />}
          label="Группировать A → Я"
          onClick={() => {
            onGroupAsc();
            onClose();
          }}
        />
        <ActionButton
          icon={<FolderTree />}
          label="Группировать Я → A"
          onClick={() => {
            onGroupDesc();
            onClose();
          }}
        />
      </div>

      <div className="border-t border-[#eef2f7] py-1">
        <ActionButton
          icon={<EyeOff />}
          label="Скрыть поле"
          onClick={() => {
            onHideField();
            onClose();
          }}
        />
      </div>
    </div>,
    document.body
  );
}
