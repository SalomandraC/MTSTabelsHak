import type { RefObject } from 'react';

type WorkspacePageActionsMenuProps = {
  title: string;
  linkedPageId: string;
  canDeletePage: boolean;
  isOpen: boolean;
  isCreateMode: boolean;
  isCreatingPage: boolean;
  createPageTitle: string;
  createError: string;
  contextMenuPosition: { left: number; top: number } | null;
  createInputRef: RefObject<HTMLInputElement>;
  onCloseActionsMenu: () => void;
  onOpenCreateMode: () => void;
  onCreatePageTitleChange: (value: string) => void;
  onCreatePageSubmit: () => void;
  onCancelCreateMode: () => void;
  onSelectPage: (pageId: string) => void;
  onDeletePage: () => void;
};

export function WorkspacePageActionsMenu({
  title,
  linkedPageId,
  canDeletePage,
  isOpen,
  isCreateMode,
  isCreatingPage,
  createPageTitle,
  createError,
  contextMenuPosition,
  createInputRef,
  onCloseActionsMenu,
  onOpenCreateMode,
  onCreatePageTitleChange,
  onCreatePageSubmit,
  onCancelCreateMode,
  onSelectPage,
  onDeletePage,
}: WorkspacePageActionsMenuProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      role="menu"
      aria-label={`Действия для страницы ${title}`}
      className={[
        'z-30 w-44 overflow-hidden rounded-xl border border-editor-border-subtle bg-white py-1 shadow-[0_16px_40px_rgba(15,23,42,0.12)]',
        contextMenuPosition ? 'fixed' : 'absolute right-0 top-7',
      ].join(' ')}
      style={
        contextMenuPosition
          ? {
              left: contextMenuPosition.left,
              top: contextMenuPosition.top,
            }
          : undefined
      }
    >
      {isCreateMode ? (
        <div className="space-y-2 px-2 py-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-[#6b7280]">Новая страница</label>
          <input
            ref={createInputRef}
            type="text"
            value={createPageTitle}
            onChange={(event) => onCreatePageTitleChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onCreatePageSubmit();
              }

              if (event.key === 'Escape') {
                event.preventDefault();
                onCancelCreateMode();
              }
            }}
            placeholder="Название страницы"
            className="h-8 w-full rounded-md border border-editor-border-subtle bg-white px-2 text-sm outline-none focus:border-[#5586ff]"
          />
          {createError ? <p className="text-xs text-[#d70032]">{createError}</p> : null}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancelCreateMode}
              className="flex-1 rounded-md border border-editor-border-subtle px-2 py-1.5 text-xs font-semibold text-[#4b5563] hover:bg-[#f7f8fa]"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={onCreatePageSubmit}
              disabled={isCreatingPage}
              className="flex-1 rounded-md bg-[#d70032] px-2 py-1.5 text-xs font-semibold text-white hover:bg-[#b8002b] disabled:cursor-wait disabled:opacity-70"
            >
              {isCreatingPage ? 'Создаем...' : 'Создать'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            role="menuitem"
            onClick={(event) => {
              event.stopPropagation();
              onCloseActionsMenu();
              onSelectPage(linkedPageId);
            }}
            className="flex w-full items-center px-3 py-2 text-left text-sm text-[#1f1f1f] hover:bg-[#f7f8fa]"
          >
            Редактировать
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={(event) => {
              event.stopPropagation();
              onOpenCreateMode();
            }}
            className="flex w-full items-center px-3 py-2 text-left text-sm text-[#1f1f1f] hover:bg-[#f7f8fa]"
          >
            Создать страницу
          </button>
          {canDeletePage ? (
            <button
              type="button"
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                onCloseActionsMenu();
                onDeletePage();
              }}
              className="flex w-full items-center px-3 py-2 text-left text-sm text-[#d70032] hover:bg-[#fff1f3]"
            >
              Удалить
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
