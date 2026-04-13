import { useState } from 'react';
import type { RefObject } from 'react';

type WorkspacePageActionsMenuProps = {
  nodeKind: 'wikiPage' | 'wikiFolder' | 'mwsFolder';
  title: string;
  linkedPageId?: string;
  canDeletePage: boolean;
  canRenameFolder?: boolean;
  canDeleteFolder?: boolean;
  isOpen: boolean;
  createMode: 'page' | 'folder' | null;
  isCreatingPage: boolean;
  isCreatingFolder?: boolean;
  createTitle: string;
  createError: string;
  contextMenuPosition: { left: number; top: number } | null;
  createInputRef: RefObject<HTMLInputElement>;
  onCloseActionsMenu: () => void;
  onOpenCreatePageMode: () => void;
  onOpenCreateFolderMode?: () => void;
  onOpenTemplateMarketplace?: () => void;
  onCreateTitleChange: (value: string) => void;
  onCreatePageSubmit: () => void;
  onCreateFolderSubmit?: () => void;
  onCancelCreateMode: () => void;
  isPinned: boolean;
  onTogglePinned: () => void;
  onDeletePage: () => void;
  onRenameFolder?: () => void;
  onDeleteFolder?: () => void;
};

export function WorkspacePageActionsMenu({
  nodeKind,
  title,
  linkedPageId,
  canDeletePage,
  canRenameFolder = false,
  canDeleteFolder = false,
  isOpen,
  createMode,
  isCreatingPage,
  isCreatingFolder = false,
  createTitle,
  createError,
  contextMenuPosition,
  createInputRef,
  onCloseActionsMenu,
  onOpenCreatePageMode,
  onOpenCreateFolderMode,
  onOpenTemplateMarketplace,
  onCreateTitleChange,
  onCreatePageSubmit,
  onCreateFolderSubmit,
  onCancelCreateMode,
  isPinned,
  onTogglePinned,
  onDeletePage,
  onRenameFolder,
  onDeleteFolder,
}: WorkspacePageActionsMenuProps) {
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const isFolder = nodeKind === 'wikiFolder' || nodeKind === 'mwsFolder';
  const isFolderCreateMode = createMode === 'folder';
  const isPageCreateMode = createMode === 'page';

  if (!isOpen) {
    return null;
  }

  return (
    <div
      role="menu"
      aria-label={isFolder ? `Действия для папки ${title}` : `Действия для страницы ${title}`}
      className={[
        'z-60 w-44 overflow-hidden rounded-xl border border-editor-border-subtle bg-white py-1 shadow-[0_16px_40px_rgba(15,23,42,0.12)]',
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
      {createMode ? (
        <div className="space-y-2 px-2 py-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
            {isFolderCreateMode ? 'Новая папка' : 'Новая страница'}
          </label>
          <input
            ref={createInputRef}
            type="text"
            value={createTitle}
            onChange={(event) => onCreateTitleChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (isFolderCreateMode) {
                  onCreateFolderSubmit?.();
                } else {
                  onCreatePageSubmit();
                }
              }

              if (event.key === 'Escape') {
                event.preventDefault();
                onCancelCreateMode();
              }
            }}
            placeholder={isFolderCreateMode ? 'Название папки' : 'Название страницы'}
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
              onClick={isFolderCreateMode ? onCreateFolderSubmit : onCreatePageSubmit}
              disabled={isFolderCreateMode ? isCreatingFolder : isCreatingPage}
              className="flex-1 rounded-md bg-[#d70032] px-2 py-1.5 text-xs font-semibold text-white hover:bg-[#b8002b] disabled:cursor-wait disabled:opacity-70"
            >
              {isFolderCreateMode
                ? (isCreatingFolder ? 'Создаем...' : 'Создать')
                : (isCreatingPage ? 'Создаем...' : 'Создать')}
            </button>
          </div>
        </div>
      ) : (
        <>
          {nodeKind === 'wikiPage' ? (
            <button
              type="button"
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                onCloseActionsMenu();
                onTogglePinned();
              }}
              className="flex w-full items-center px-3 py-2 text-left text-sm text-[#1f1f1f] hover:bg-[#f7f8fa]"
            >
              {isPinned ? 'Открепить' : 'Закрепить'}
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={(event) => {
              event.stopPropagation();
              onOpenCreatePageMode();
            }}
            className="flex w-full items-center px-3 py-2 text-left text-sm text-[#1f1f1f] hover:bg-[#f7f8fa]"
          >
            Создать страницу
          </button>
          {isFolder ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenTemplateMarketplace?.();
                }}
                className="flex w-full items-center px-3 py-2 text-left text-sm text-[#1f1f1f] hover:bg-[#f7f8fa]"
              >
                Создать из шаблона
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenCreateFolderMode?.();
                }}
                className="flex w-full items-center px-3 py-2 text-left text-sm text-[#1f1f1f] hover:bg-[#f7f8fa]"
              >
                Создать папку
              </button>
              {canRenameFolder ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseActionsMenu();
                    onRenameFolder?.();
                  }}
                  className="flex w-full items-center px-3 py-2 text-left text-sm text-[#1f1f1f] hover:bg-[#f7f8fa]"
                >
                  Переименовать папку
                </button>
              ) : null}
              {canDeleteFolder ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsConfirmDeleteOpen(true);
                  }}
                  className="flex w-full items-center px-3 py-2 text-left text-sm text-[#d70032] hover:bg-[#fff1f3]"
                >
                  Удалить папку
                </button>
              ) : null}
            </>
          ) : null}
          {nodeKind === 'wikiPage' && canDeletePage ? (
            <button
              type="button"
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                setIsConfirmDeleteOpen(true);
              }}
              className="flex w-full items-center px-3 py-2 text-left text-sm text-[#d70032] hover:bg-[#fff1f3]"
            >
              Удалить
            </button>
          ) : null}
          {isConfirmDeleteOpen && (
            <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/30 p-4">
              <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
                <p className="text-sm leading-6 text-[#1f1f1f]">
                  {isFolder
                    ? `Удалить папку «${title}»? Вложенные страницы и папки будут скрыты из дерева.`
                    : `Удалить страницу «${title}»? Таблицы MWS при этом не удаляются.`}
                </p>
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsConfirmDeleteOpen(false);
                      onCloseActionsMenu();
                    }}
                    className="rounded-lg border border-editor-border-subtle bg-white px-4 py-2 text-sm font-semibold text-[#505762] hover:bg-[#f7f8fa]"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsConfirmDeleteOpen(false);
                      onCloseActionsMenu();
                      if (isFolder) {
                        onDeleteFolder?.();
                      } else {
                        onDeletePage();
                      }
                    }}
                    className="rounded-lg bg-[#d70032] px-4 py-2 text-sm font-semibold text-white hover:bg-[#b8002b]"
                  >
                    {isFolder ? 'Удалить папку' : 'Удалить'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}