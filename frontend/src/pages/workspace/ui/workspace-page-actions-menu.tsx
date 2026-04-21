import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { RefObject } from 'react';
import { ChevronRight, FileDown, FolderPlus, Pin, PinOff, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { ExportFormat } from '../../../shared/lib/export-document';

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
  onExport?: (format: ExportFormat) => void;
};

const EXPORT_FORMATS: { format: ExportFormat; label: string }[] = [
  { format: 'pdf', label: 'PDF' },
  { format: 'docx', label: 'DOCX' },
  { format: 'md', label: 'Markdown' },
];

export function WorkspacePageActionsMenu({
  nodeKind,
  title,
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
  onExport,
}: WorkspacePageActionsMenuProps) {
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [exportSubmenuOpen, setExportSubmenuOpen] = useState(false);
  const isFolder = nodeKind === 'wikiFolder' || nodeKind === 'mwsFolder';
  const isFolderCreateMode = createMode === 'folder';

  useEffect(() => {
    if (!isOpen) {
      setIsConfirmDeleteOpen(false);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      role="menu"
      aria-label={isFolder ? `Действия для папки ${title}` : `Действия для страницы ${title}`}
      className={[
        'z-[900] w-44 rounded-xl border border-editor-border-subtle bg-white py-1 shadow-[0_16px_40px_rgba(15,23,42,0.12)]',
        contextMenuPosition
          ? 'fixed'
          : 'absolute left-full top-1/2 -translate-y-1/2 ml-2',
      ].join(' ')}
      style={
        contextMenuPosition
          ? { left: contextMenuPosition.left, top: contextMenuPosition.top }
          : undefined
      }
    >
      {createMode ? (
        <div className="space-y-2 px-2 py-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
            {isFolderCreateMode ? 'Новая папка' : 'Создать страницу'}
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
            className="h-8 w-full rounded-md border border-editor-border-subtle bg-white px-2 text-sm outline-none focus:border-[#fff7f8] focus:ring-1 focus:ring-[#d70032]"
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
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-normal text-[#1f1f1f] transition-colors hover:bg-[#f7f8fa]"
            >
              {isPinned ? <PinOff size={14} strokeWidth={2.2} className="shrink-0 text-[#6b7280]" /> : <Pin size={14} strokeWidth={2.2} className="shrink-0 text-[#6b7280]" />}
              <span>{isPinned ? 'Открепить' : 'Закрепить'}</span>
            </button>
          ) : null}
          {isFolder ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenTemplateMarketplace?.();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-normal text-[#1f1f1f] transition-colors hover:bg-[#f7f8fa]"
              >
                <Sparkles size={14} strokeWidth={2.2} className="shrink-0 text-[#6b7280]" />
                <span>Создать из шаблона</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenCreateFolderMode?.();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-normal text-[#1f1f1f] transition-colors hover:bg-[#f7f8fa]"
              >
                <FolderPlus size={14} strokeWidth={2.2} className="shrink-0 text-[#6b7280]" />
                <span>Создать папку</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenCreatePageMode();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-normal text-[#1f1f1f] transition-colors hover:bg-[#f7f8fa]"
              >
                <Plus size={14} strokeWidth={2.2} className="shrink-0 text-[#6b7280]" />
                <span>Создать страницу</span>
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
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-normal text-[#1f1f1f] transition-colors hover:bg-[#f7f8fa]"
                >
                  <Pencil size={14} strokeWidth={2.2} className="shrink-0 text-[#6b7280]" />
                  <span>Переименовать папку</span>
                </button>
              ) : null}
              {canDeleteFolder ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseActionsMenu();
                    onDeleteFolder?.();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-normal text-[#d70032] transition-colors hover:bg-[#fff1f3]"
                >
                  <Trash2 size={14} strokeWidth={2.2} className="shrink-0 text-[#d70032]" />
                  <span>Удалить папку</span>
                </button>
              ) : null}
            </>
          ) : null}

          {!isFolder ? (
            <button
              type="button"
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                onOpenCreatePageMode();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-normal text-[#1f1f1f] transition-colors hover:bg-[#f7f8fa]"
            >
              <Plus size={14} strokeWidth={2.2} className="shrink-0 text-[#6b7280]" />
              <span>Создать страницу</span>
            </button>
          ) : null}

          {nodeKind === 'wikiPage' && canDeletePage ? (
            <button
              type="button"
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                setIsConfirmDeleteOpen(true);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-normal text-[#d70032] transition-colors hover:bg-[#fff1f3]"
            >
              <Trash2 size={14} strokeWidth={2.2} className="shrink-0 text-[#d70032]" />
              <span>Удалить</span>
            </button>
          ) : null}

          {nodeKind === 'wikiPage' && onExport ? (
            <div
              className="relative"
              onMouseEnter={() => setExportSubmenuOpen(true)}
              onMouseLeave={() => setExportSubmenuOpen(false)}
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-normal text-[#1f1f1f] transition-colors hover:bg-[#f7f8fa]"
              >
                <span className="flex items-center gap-2">
                  <FileDown size={14} strokeWidth={2.2} className="shrink-0 text-[#6b7280]" />
                  Экспортировать
                </span>
                <ChevronRight size={14} strokeWidth={2.2} className="text-[#9ca3af]" />
              </button>
              {exportSubmenuOpen && (
                <div className="absolute left-full top-0 z-50 w-32 overflow-hidden rounded-xl border border-editor-border-subtle bg-white py-1 shadow-[0_16px_40px_rgba(15,23,42,0.12)]">
                  {EXPORT_FORMATS.map(({ format, label }) => (
                    <button
                      key={format}
                      type="button"
                      role="menuitem"
                      onClick={(event) => {
                        event.stopPropagation();
                        onCloseActionsMenu();
                        onExport(format);
                      }}
                      className="flex w-full items-center px-3 py-2 text-left text-sm font-normal text-[#1f1f1f] transition-colors hover:bg-[#f7f8fa]"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {isConfirmDeleteOpen && createPortal(
            <div
              className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/30 p-4"
              role="dialog"
              aria-modal="true"
              aria-label="Подтверждение удаления"
              onMouseDown={(event) => event.stopPropagation()}
            >
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
            </div>,
            document.body,
          )}
        </>
      )}
    </div>
  );
}
