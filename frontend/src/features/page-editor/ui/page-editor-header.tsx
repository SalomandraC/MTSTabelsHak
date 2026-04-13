import React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import DOC from '../../../app/images/Doc.svg';
import type { PresenceUser } from '../../../shared/api/wikilive';
import type { PageEditorViewMode } from '../model/editor-view-preferences';

type PageEditorHeaderProps = {
  title: string;
  description: string;
  editable?: boolean;
  viewMode?: PageEditorViewMode;
  showViewModeControls?: boolean;
  connectionStatus?: string;
  saveStatus?: string;
  recoveryMessage?: string | null;
  activeUsers?: PresenceUser[];
  onSave?: (title: string, description: string) => void;
  onViewModeChange?: (mode: PageEditorViewMode) => void;
};

const VIEW_MODE_OPTIONS: Array<{ value: PageEditorViewMode; label: string; description: string }> = [
  {
    value: 'standard',
    label: 'Стандартный',
    description: 'Свободная рабочая область без разбивки на страницы',
  },
  {
    value: 'paged',
    label: 'Страницы',
    description: 'Фиксированная ширина документа с page-like разметкой',
  },
];

function PresenceStrip({ users }: { users: PresenceUser[] }) {
  if (users.length === 0) {
    return <span className="rounded-full bg-[#f7f7f8] px-2 py-1 text-[#767676]">В документе никого нет</span>;
  }

  return (
    <div className="flex items-center gap-2 rounded-full border border-editor-border-subtle bg-white px-2 py-1 shadow-sm">
      <span className="font-semibold text-[#1d2023]">{users.length} в документе</span>
      <div className="flex -space-x-1">
        {users.slice(0, 5).map((user) => (
          <span
            key={user.userId}
            title={user.displayName}
            className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow-sm"
            style={{ backgroundColor: user.color ?? '#111827' }}
          >
            {user.displayName.slice(0, 1).toUpperCase()}
          </span>
        ))}
      </div>
      <span className="max-w-[18rem] truncate text-[#505762]">{users.map((user) => user.displayName).join(', ')}</span>
    </div>
  );
}

export function PageEditorHeader({
  title,
  description,
  editable = true,
  viewMode = 'standard',
  showViewModeControls = false,
  connectionStatus,
  saveStatus,
  recoveryMessage,
  activeUsers = [],
  onSave,
  onViewModeChange,
}: PageEditorHeaderProps) {
  const [editingField, setEditingField] = React.useState<'title' | 'description' | null>(null);
  const [localTitle, setLocalTitle] = React.useState(title);
  const [localDescription, setLocalDescription] = React.useState(description);

  React.useEffect(() => setLocalTitle(title), [title]);
  React.useEffect(() => setLocalDescription(description), [description]);

  const handleSave = () => {
    const newTitle = localTitle.trim() || 'Новая страница';
    const newDescription = localDescription.trim();
    
    if (newTitle !== title || newDescription !== description) {
      onSave?.(newTitle, newDescription);
    }
    
    setEditingField(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    }
    if (e.key === 'Escape') {
      setEditingField(null);
      setLocalTitle(title);
      setLocalDescription(description);
    }
  };

  const headerRef = React.useRef<HTMLElement | null>(null);
  const viewMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [isStatusVisible, setIsStatusVisible] = React.useState(true);
  const [isViewMenuOpen, setIsViewMenuOpen] = React.useState(false);

  const activeViewModeOption = VIEW_MODE_OPTIONS.find((option) => option.value === viewMode) ?? VIEW_MODE_OPTIONS[0];

  React.useEffect(() => {
    if (!headerRef.current || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setIsStatusVisible(width >= 600);
    });

    observer.observe(headerRef.current);

    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (!isViewMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (viewMenuRef.current && !viewMenuRef.current.contains(event.target as Node)) {
        setIsViewMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsViewMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isViewMenuOpen]);
  
  const fontFamilyStyle = {
    fontFamily: "'MTSWide', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  };

  const boldStyle = {
    ...fontFamilyStyle,
    fontWeight: 'bold' as const,
  };

  return (
    <header
      ref={headerRef}
      data-page-editor-header
      className="relative z-[30] flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 border-b border-editor-border-subtle bg-editor-bg-page px-3 py-3 sm:px-4 sm:py-4"
      style={fontFamilyStyle}
    >
      <div className="relative flex shrink-0 flex-col items-start gap-2">
        {showViewModeControls ? (
          <div ref={viewMenuRef} className="relative">
            <div className="mb-2 text-[8px]  font-semibold uppercase text-center tracking-[0.16em] text-editor-text-tertiary">Вид страницы</div>
            <button
              type="button"
              onClick={() => setIsViewMenuOpen((current) => !current)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-editor-border-subtle bg-white px-2.5 py-1 text-[11px] font-semibold text-editor-text-secondary shadow-sm transition-colors hover:bg-editor-bg-control"
              aria-haspopup="menu"
              aria-expanded={isViewMenuOpen}
              aria-label="Выбрать представление документа"
            >
              <span>{activeViewModeOption.label}</span>
              <ChevronDown size={13} className={isViewMenuOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
            </button>

            {isViewMenuOpen ? (
              <div
                role="menu"
                aria-label="Выбор представления документа"
                className="absolute left-0 top-[calc(100%+8px)] z-[80] w-64 overflow-hidden rounded-2xl border border-editor-border-subtle bg-white p-1.5 shadow-[0_16px_40px_rgba(15,23,42,0.12)]"
              >
                {VIEW_MODE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={viewMode === option.value}
                    onClick={() => {
                      onViewModeChange?.(option.value);
                      setIsViewMenuOpen(false);
                    }}
                    className="flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-[#f5f7fa]"
                  >
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-[#d70032]">
                      {viewMode === option.value ? <Check size={14} strokeWidth={2.6} /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-editor-text-primary">{option.label}</span>
                      <span className="block text-xs text-editor-text-tertiary">{option.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <span className="inline-flex h-7 w-7 items-center justify-center text-[0.65rem] font-semibold text-editor-brand mt-0.5">
          <img
            src={DOC}
            alt="Иконка страницы"
            className="h-6 w-6"
          />
        </span>
      </div>

      <div className="relative z-50 min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            {editingField === 'title' ? (
              <input
                type="text"
                value={localTitle}
                onChange={(e) => setLocalTitle(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                className="w-full font-wide text-sm leading-5 text-editor-text-primary bg-editor-bg-input border border-editor-border-control rounded-md px-2 py-1 focus:outline-none focus:border-editor-brand"
                placeholder="Название страницы"
                autoFocus
                style={fontFamilyStyle}
              />
            ) : (
              <h1
                className="truncate font-wide text-sm leading-5 text-editor-text-primary cursor-text hover:bg-editor-bg-control/50 rounded px-1 -mx-1 transition-colors"
                style={boldStyle}
                onDoubleClick={() => {
                  if (!editable) {
                    return;
                  }
                  setLocalTitle(title);
                  setEditingField('title');
                }}
              >
                {title}
              </h1>
            )}
            {editingField === 'description' ? (
              <input
                type="text"
                value={localDescription}
                onChange={(e) => setLocalDescription(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                className="mt-1 w-full text-sm leading-5 bg-editor-bg-input border border-editor-border-control rounded-md px-2 py-1 focus:outline-none focus:border-editor-brand"
                style={{ ...fontFamilyStyle, color: 'rgba(150, 159, 168, 1)' }}
                placeholder="Добавить описание"
                autoFocus
              />
            ) : (
              <p
                className="truncate text-sm leading-5 cursor-text hover:bg-editor-bg-control/50 rounded px-1 -mx-1 transition-colors"
                style={{ ...fontFamilyStyle, color: 'rgba(150, 159, 168, 1)' }}
                onDoubleClick={() => {
                  if (!editable) {
                    return;
                  }
                  setLocalDescription(description);
                  setEditingField('description');
                }}
              >
                {description || 'Добавить описание'}
              </p>
            )}
          </div>
        </div>
      </div>

      {isStatusVisible ? (
        <div className="relative z-10 min-w-0 flex shrink-0 w-full sm:w-auto flex-col items-end gap-2 text-right">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-editor-text-tertiary justify-end w-full sm:w-auto">
            <PresenceStrip users={activeUsers} />
            {connectionStatus ? (
              <span className="rounded-lg bg-[#d70032] px-2 py-1 font-semibold text-white">кооперация: {connectionStatus}</span>
            ) : null}
            {saveStatus ? <span>{saveStatus}</span> : null}
            {recoveryMessage ? (
              <span className="rounded-full bg-[#fff4df] px-2 py-1 text-[#9a5b00]">{recoveryMessage}</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </header>
  );
}
