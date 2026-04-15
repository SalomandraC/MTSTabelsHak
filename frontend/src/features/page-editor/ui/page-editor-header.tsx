import React from 'react';
import { Check, ChevronDown, MoreHorizontal } from 'lucide-react';

import type { PresenceUser } from '../../../shared/api/wikilive';
import type { PageEditorViewMode } from '../model/editor-view-preferences';

type PageEditorHeaderProps = {
  title: string;
  description: string;
  editable?: boolean;
  viewMode?: PageEditorViewMode;
  showViewModeControls?: boolean;
  hideCooperationBadge?: boolean;
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

function getUserInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return '?';
  }

  if (parts.length === 1) {
    return parts[0]!.slice(0, 1).toUpperCase();
  }

  return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase();
}

function getSyncIndicator(connectionStatus?: string, saveStatus?: string, recoveryMessage?: string | null) {
  const normalizedStatus = connectionStatus?.toLowerCase() ?? '';
  const normalizedSaveStatus = saveStatus?.toLowerCase() ?? '';

  if (recoveryMessage) {
    return {
      label: recoveryMessage,
      dotClassName: 'bg-[#f59e0b]',
      shellClassName: 'border-[#f8d9a0] bg-[#fff8eb]',
    };
  }

  if (
    normalizedStatus === 'error' ||
    normalizedStatus === 'offline' ||
    normalizedSaveStatus.includes('error') ||
    normalizedSaveStatus.includes('не удалось')
  ) {
    return {
      label: saveStatus || 'Ошибка соединения',
      dotClassName: 'bg-[#dc2626]',
      shellClassName: 'border-[#f5c7c7] bg-[#fff5f5]',
    };
  }

  if (
    normalizedStatus === 'connecting' ||
    normalizedSaveStatus.includes('сохраня') ||
    normalizedSaveStatus.includes('открыва') ||
    normalizedSaveStatus.includes('черновик')
  ) {
    return {
      label: saveStatus || 'Синхронизация...',
      dotClassName: 'bg-[#f59e0b]',
      shellClassName: 'border-[#f8d9a0] bg-[#fff8eb]',
    };
  }

  return {
    label: saveStatus || 'Синхронизировано',
    dotClassName: 'bg-[#16a34a]',
    shellClassName: 'border-[#cfe8d7] bg-[#f4fbf6]',
  };
}

function ParticipantsMenu({
  users,
  isOpen,
  onToggle,
}: {
  users: PresenceUser[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  if (users.length === 0) {
    return null;
  }

  const visibleUsers = users.slice(0, 3);
  const remainingUsersCount = users.length - visibleUsers.length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-2 rounded-full border border-editor-border-subtle bg-white px-2 py-1 shadow-sm transition-colors hover:bg-[#f8fafc]"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Показать участников документа"
        title={users.map((user) => user.displayName).join(', ')}
      >
        <div className="flex -space-x-2">
          {visibleUsers.map((user) => (
            <span
              key={user.userId}
              className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-semibold text-white shadow-sm"
              style={{ backgroundColor: user.color ?? '#111827' }}
              title={user.displayName}
            >
              {getUserInitials(user.displayName)}
            </span>
          ))}
          {remainingUsersCount > 0 ? (
            <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#e9edf5] text-[10px] font-semibold text-[#445065] shadow-sm">
              +{remainingUsersCount}
            </span>
          ) : null}
        </div>
      </button>

      {isOpen ? (
        <div
          role="menu"
          aria-label="Участники документа"
          className="absolute right-0 top-[calc(100%+10px)] z-[80] w-72 overflow-hidden rounded-2xl border border-editor-border-subtle bg-white p-2 shadow-[0_18px_50px_rgba(15,23,42,0.14)]"
        >
          <div className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b94a3]">
            В документе
          </div>
          <div className="space-y-1">
            {users.map((user) => (
              <div
                key={user.userId}
                className="flex items-center gap-3 rounded-xl px-2 py-2 text-left"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: user.color ?? '#111827' }}
                >
                  {getUserInitials(user.displayName)}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-editor-text-primary">{user.displayName}</div>
                  <div className="truncate text-xs text-editor-text-tertiary">Активен в документе</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PageEditorHeader({
  title,
  description,
  editable = true,
  viewMode = 'standard',
  showViewModeControls = false,
  hideCooperationBadge = false,
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
  const [isCompactHeader, setIsCompactHeader] = React.useState(false);
  const [isViewMenuOpen, setIsViewMenuOpen] = React.useState(false);
  const [isParticipantsMenuOpen, setIsParticipantsMenuOpen] = React.useState(false);

  const headerRef = React.useRef<HTMLElement | null>(null);
  const viewMenuRef = React.useRef<HTMLDivElement | null>(null);
  const participantsMenuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => setLocalTitle(title), [title]);
  React.useEffect(() => setLocalDescription(description), [description]);

  React.useEffect(() => {
    if (!headerRef.current || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setIsCompactHeader(width < 780);
    });

    observer.observe(headerRef.current);

    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (!isViewMenuOpen && !isParticipantsMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (isViewMenuOpen && viewMenuRef.current && !viewMenuRef.current.contains(target)) {
        setIsViewMenuOpen(false);
      }

      if (isParticipantsMenuOpen && participantsMenuRef.current && !participantsMenuRef.current.contains(target)) {
        setIsParticipantsMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsViewMenuOpen(false);
        setIsParticipantsMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isParticipantsMenuOpen, isViewMenuOpen]);

  const handleSave = React.useCallback(() => {
    const nextTitle = localTitle.trim() || 'Новая страница';
    const nextDescription = localDescription.trim();

    if (nextTitle !== title || nextDescription !== description) {
      onSave?.(nextTitle, nextDescription);
    }

    setEditingField(null);
  }, [description, localDescription, localTitle, onSave, title]);

  const handleCancelEditing = React.useCallback(() => {
    setEditingField(null);
    setLocalTitle(title);
    setLocalDescription(description);
  }, [description, title]);

  const handleInputKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleSave();
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        handleCancelEditing();
      }
    },
    [handleCancelEditing, handleSave],
  );

  const syncIndicator = getSyncIndicator(connectionStatus, saveStatus, recoveryMessage);
  const visibleDescription = !isCompactHeader;
  const participants = hideCooperationBadge ? activeUsers.slice(0, 3) : activeUsers;

  return (
    <header
      ref={headerRef}
      data-page-editor-header
      className="relative z-[30] border-b border-editor-border-subtle bg-white/95 px-4 py-3 backdrop-blur-sm sm:px-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-start lg:gap-6">
          <div className="min-w-0 flex-1">
            {editingField === 'title' ? (
              <input
                type="text"
                value={localTitle}
                onChange={(event) => setLocalTitle(event.target.value)}
                onBlur={handleSave}
                onKeyDown={handleInputKeyDown}
                className="h-10 w-full rounded-xl border border-[#d7dde8] bg-white px-3 text-[1.05rem] font-semibold tracking-[-0.01em] text-editor-text-primary outline-none transition-colors focus:border-[#d70032]"
                placeholder="Название страницы"
                autoFocus
              />
            ) : (
              <button
                type="button"
                disabled={!editable}
                onClick={() => {
                  if (!editable) {
                    return;
                  }

                  setLocalTitle(title);
                  setEditingField('title');
                }}
                className={[
                  'block max-w-full truncate rounded-lg text-left text-[1.05rem] font-semibold tracking-[-0.01em] text-editor-text-primary',
                  editable ? 'cursor-text transition-colors hover:bg-[#f5f7fb] hover:text-[#111827]' : 'cursor-default',
                ].join(' ')}
                title={title}
              >
                {title}
              </button>
            )}

            {visibleDescription ? (
              editingField === 'description' ? (
                <input
                  type="text"
                  value={localDescription}
                  onChange={(event) => setLocalDescription(event.target.value)}
                  onBlur={handleSave}
                  onKeyDown={handleInputKeyDown}
                  className="mt-1.5 h-9 w-full rounded-xl border border-[#d7dde8] bg-white px-3 text-sm text-[#667085] outline-none transition-colors focus:border-[#d70032]"
                  placeholder="Добавить описание"
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  disabled={!editable}
                  onClick={() => {
                    if (!editable) {
                      return;
                    }

                    setLocalDescription(description);
                    setEditingField('description');
                  }}
                  className={[
                    'mt-1 block max-w-full truncate rounded-lg text-left text-sm text-[#7b8798]',
                    editable ? 'cursor-text transition-colors hover:bg-[#f5f7fb] hover:text-[#526071]' : 'cursor-default',
                  ].join(' ')}
                  title={description || 'Добавить описание'}
                >
                  {description || 'Добавить описание'}
                </button>
              )
            ) : null}
          </div>

          {showViewModeControls ? (
            <div ref={viewMenuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setIsViewMenuOpen((current) => !current)}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-editor-border-subtle bg-white px-3 text-sm font-medium text-[#3f4958] shadow-sm transition-colors hover:bg-[#f8fafc]"
                aria-haspopup="menu"
                aria-expanded={isViewMenuOpen}
                aria-label={isCompactHeader ? 'Открыть меню документа' : 'Вид'}
                title="Вид"
              >
                {isCompactHeader ? <MoreHorizontal size={16} strokeWidth={2.2} /> : <span>Вид</span>}
                <ChevronDown size={15} className={isViewMenuOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
              </button>

              {isViewMenuOpen ? (
                <div
                  role="menu"
                  aria-label="Выбор представления документа"
                  className="absolute right-0 top-[calc(100%+10px)] z-[80] w-72 overflow-hidden rounded-2xl border border-editor-border-subtle bg-white p-2 shadow-[0_18px_50px_rgba(15,23,42,0.14)]"
                >
                  <div className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b94a3]">
                    Вид документа
                  </div>
                  <div className="space-y-1">
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
                        className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[#f5f7fb]"
                      >
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-[#d70032]">
                          {viewMode === option.value ? <Check size={14} strokeWidth={2.6} /> : null}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-editor-text-primary">{option.label}</span>
                          <span className="mt-0.5 block text-xs leading-5 text-editor-text-tertiary">{option.description}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            className={[
              'inline-flex h-9 w-9 items-center justify-center rounded-full border shadow-sm transition-colors',
              syncIndicator.shellClassName,
            ].join(' ')}
            title={syncIndicator.label}
            aria-label={syncIndicator.label}
          >
            <span className={['h-2.5 w-2.5 rounded-full', syncIndicator.dotClassName].join(' ')} />
          </button>

          <div ref={participantsMenuRef}>
            <ParticipantsMenu
              users={participants}
              isOpen={isParticipantsMenuOpen}
              onToggle={() => setIsParticipantsMenuOpen((current) => !current)}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
