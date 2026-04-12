import React from 'react';
import DOC from '../../../app/images/Doc.svg';
import type { PresenceUser } from '../../../shared/api/wikilive';

type PageEditorHeaderProps = {
  title: string;
  description: string;
  editable?: boolean;
  connectionStatus?: string;
  saveStatus?: string;
  recoveryMessage?: string | null;
  activeUsers?: PresenceUser[];
  onSave?: (title: string, description: string) => void;
};

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
  connectionStatus,
  saveStatus,
  recoveryMessage,
  activeUsers = [],
  onSave,
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
  const [isStatusVisible, setIsStatusVisible] = React.useState(true);

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
      className="flex flex-wrap sm:flex-nowrap items-start justify-between gap-3 border-b border-editor-border-subtle bg-editor-bg-page px-3 py-3 sm:px-4 sm:py-4"
      style={fontFamilyStyle}
    >
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-[0.65rem] font-semibold text-editor-brand mt-0.5">
        <img
          src={DOC}
          alt="Иконка страницы"
          className="h-4 w-4"
        />
      </span>

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
              <span className="rounded-lg bg-[#d70032] px-2 py-1 font-semibold text-white">collab: {connectionStatus}</span>
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
