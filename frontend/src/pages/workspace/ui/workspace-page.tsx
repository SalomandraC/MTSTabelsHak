import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { Editor } from '@tiptap/core';
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  FileDown,
  FileUp,
  FolderPlus,
  History,
  LogOut,
  MoreHorizontal,
  MessageSquare,
  Pencil,
  Plus,
  List,
  Search,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';

import { useAuthSessionContext } from '../../../features/auth';
import { PageEditor } from '../../../features/page-editor';
import { usePageComments, type CommentThreadView } from '../../../features/page-editor/model/use-page-comments';
import { usePageHistory } from '../../../features/page-editor/model/use-page-history';
import { CommentsPanel } from '../../../features/page-editor/ui/comments-panel';
import { TimeMachinePanel } from '../../../features/page-editor/ui/time-machine-panel';
import { AiSidebarChat } from '../../../features/plugins/ai-assistant';
import { NavigationSidebar, PluginsModal, usePlugins } from '../../../features/plugins';
import { ScrollArea } from '../../../shared/ui';
import workspaceLogo from '../../../app/images/logo.svg';
import {
  DEFAULT_WIKILIVE_SPACE_ID,
  type Backlink,
  type DocumentAccessPolicy,
  type MwsSpace,
  type OutgoingLink,
  type PageHistoryCheckpoint,
  type TemplateCategorySummary,
  type TemplateListQuery,
  type PageTemplateSummary,
  type WikiPage,
  type WorkspaceTreeNode,
  type WorkspaceRealtimeEvent,
  wikiliveApi,
} from '../../../shared/api/wikilive';
import { DocumentLinkGraph, type DocumentGraphEdge, type DocumentGraphPage } from './document-link-graph';
import { CreateTemplateFromPageModal } from './create-template-from-page-modal';
import { WorkspaceAccessSummary } from './workspace-access-summary';
import { PageTemplateMarketplaceModal } from './page-template-marketplace-modal';
import { WorkspacePageActionsMenu } from './workspace-page-actions-menu';
import { isWorkspaceFolder, shouldShowWorkspacePageActions } from './workspace-node-permissions';
import { getWorkspaceNodeIcon } from './workspace-node-icon';
import { readWorkspaceRoute, resolveAccessibleSpaceId, writeWorkspaceRoute } from '../../../shared/lib/workspace-route';
import { exportDocument, type ExportFormat } from '../../../shared/lib/export-document';
import {
  LEFT_SIDEBAR_MAX_WIDTH,
  LEFT_SIDEBAR_MIN_WIDTH,
  RIGHT_SIDEBAR_MAX_WIDTH,
  RIGHT_SIDEBAR_MIN_WIDTH,
  useResizableSidebar,
} from './workspace-layout';

const SELECTED_SPACE_STORAGE_KEY = 'wikilive:selected-space-id';
const DEFAULT_TEMPLATE_PAGE_SIZE = 20;
const WHATS_NEW_BANNER_DURATION_SEC = 30;
const WHATS_NEW_BANNER_STORAGE_KEY = 'wikilive:disable-whats-new-banner';
const WHATS_NEW_BANNER_ENABLED = (import.meta.env.VITE_ENABLE_WHATS_NEW_BANNER ?? 'true') !== 'false';

function getShareUrl(spaceId: string, pageId: string | null) {
  const url = new URL(window.location.href);
  url.pathname = pageId
    ? `/spaces/${encodeURIComponent(spaceId)}/pages/${encodeURIComponent(pageId)}`
    : `/spaces/${encodeURIComponent(spaceId)}`;
  url.searchParams.delete('spaceId');
  url.searchParams.delete('pageId');

  return url.toString();
}

function calculateContextMenuPosition(rect: DOMRect, menuWidth: number, menuHeight: number) {
  return {
    left: Math.min(rect.right + 8, window.innerWidth - menuWidth - 8),
    top: Math.max(
      8,
      Math.min(
        rect.top + rect.height / 2 - menuHeight / 2 + rect.height * 0.25,
        window.innerHeight - menuHeight - 8,
      ),
    ),
  };
}

function flattenWorkspacePages(nodes: WorkspaceTreeNode[]): DocumentGraphPage[] {
  return nodes.flatMap((node) => [
    ...(node.kind === 'wikiPage' && node.linkedPageId ? [{ id: node.linkedPageId, title: node.title }] : []),
    ...flattenWorkspacePages(node.children ?? []),
  ]);
}

function collectWorkspaceFolderIds(nodes: WorkspaceTreeNode[]): string[] {
  return nodes.flatMap((node) => [
    ...(isWorkspaceFolder(node) ? [node.id] : []),
    ...collectWorkspaceFolderIds(node.children ?? []),
  ]);
}

function isWorkspaceMovableNode(node: WorkspaceTreeNode): boolean {
  return node.kind === 'wikiPage' || node.kind === 'wikiFolder';
}

function canAcceptWorkspaceDrop(node: WorkspaceTreeNode): boolean {
  return isWorkspaceFolder(node);
}

function filterWorkspaceTree(nodes: WorkspaceTreeNode[], query: string): WorkspaceTreeNode[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return nodes;
  }

  return nodes
    .map((node) => {
      const children = filterWorkspaceTree(node.children ?? [], normalizedQuery);
      const isMatched = node.title.toLowerCase().includes(normalizedQuery);

      if (!isMatched && children.length === 0) {
        return null;
      }

      return {
        ...node,
        children,
      };
    })
    .filter((node): node is WorkspaceTreeNode => Boolean(node));
}

function findPinnedPages(nodes: WorkspaceTreeNode[], pinnedPageIds: Set<string>): WorkspaceTreeNode[] {
  return nodes.flatMap((node) => [
    ...(node.kind === 'wikiPage' && node.linkedPageId && pinnedPageIds.has(node.linkedPageId)
      ? [{ ...node, children: [] }]
      : []),
    ...findPinnedPages(node.children ?? [], pinnedPageIds),
  ]);
}

function removePinnedPages(nodes: WorkspaceTreeNode[], pinnedPageIds: Set<string>): WorkspaceTreeNode[] {
  return nodes
    .map((node) => {
      if (node.kind === 'wikiPage' && node.linkedPageId && pinnedPageIds.has(node.linkedPageId)) {
        return null;
      }

      const children = removePinnedPages(node.children ?? [], pinnedPageIds);

      if (isWorkspaceFolder(node) && node.children.length > 0 && children.length === 0) {
        return null;
      }

      return {
        ...node,
        children,
      };
    })
    .filter((node): node is WorkspaceTreeNode => Boolean(node));
}

function WorkspaceLogo() {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[8px] shadow-sm">
      <img src={workspaceLogo} alt="Логотип WikiLive" className="h-full w-full object-cover" />
    </div>
  );
}

function WorkspaceTreeSkeleton() {
  return (
    <div className="space-y-2 px-2 py-2" aria-hidden="true">
      <div className="animate-pulse rounded-xl bg-[#eceff3] p-3">
        <div className="h-4 w-3/5 rounded-full bg-[#dde2e9]" />
      </div>
      <div className="space-y-2">
        {[
          { width: '78%', indent: 'ml-0' },
          { width: '64%', indent: 'ml-5' },
          { width: '72%', indent: 'ml-10' },
          { width: '58%', indent: 'ml-5' },
          { width: '86%', indent: 'ml-0' },
        ].map((item, index) => (
          <div key={`workspace-skeleton-${index}`} className={`flex items-center gap-2 px-1 ${item.indent}`}>
            <div className="h-5 w-5 shrink-0 rounded-md bg-[#eceff3] animate-pulse" />
            <div className="h-8 flex-1 rounded-lg bg-[#eceff3] animate-pulse" style={{ width: item.width }} />
          </div>
        ))}
      </div>
    </div>
  );
}

type RightPanelMode = 'toolbar' | 'comments' | 'timeMachine' | 'navigation' | 'chat';

function BlankAreaMenuItem({
  icon,
  label,
  shortcut,
  disabled = false,
  destructive = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  destructive?: boolean;
  onClick?: () => void;
}) {
  const toneClass = disabled
    ? 'cursor-default text-[#a4acb7]'
    : destructive
      ? 'text-[#d70032] hover:bg-[#fff1f3]'
      : 'text-[#1f1f1f] hover:bg-[#f5f7fa]';

  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] transition-colors',
        toneClass,
      ].join(' ')}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut ? <span className="shrink-0 text-[13px] text-[#9aa3af]">{shortcut}</span> : null}
    </button>
  );
}

const ACCESS_SCOPE_OPTIONS: Array<{
  value: DocumentAccessPolicy['viewAccess'];
  label: string;
}> = [
  { value: 'owner_only', label: 'Только владелец' },
  { value: 'space_members', label: 'Участники пространства' },
  { value: 'link_holders', label: 'Все, у кого есть ссылка' },
];

function WorkspaceTreeItem({
  node,
  depth,
  activePageId,
  selectedTableNodeId,
  expandedFolderIds,
  pinnedPageIds,
  onTogglePinnedPage,
  onSelectPage,
  onSelectMwsTable,
  onToggleFolder,
  onDeletePage,
  onDeleteFolder,
  onRenameFolder,
  onCreatePage,
  onExportPage,
  onMoveNode,
  onMoveNodeToRoot,
  dragSourceId,
  dragOverNodeId,
  dragOverPosition,
  setDragSourceId,
  setDragOverNodeId,
  setDragOverPosition,
  spaceId,
  onCreateFolder,
  onCreateFromTemplate,
}: {
  node: WorkspaceTreeNode;
  depth: number;
  activePageId: string | null;
  selectedTableNodeId: string | null;
  expandedFolderIds: Set<string>;
  pinnedPageIds: Set<string>;
  onTogglePinnedPage: (pageId: string) => void;
  onSelectPage: (pageId: string) => void;
  onSelectMwsTable: (node: WorkspaceTreeNode) => void;
  onToggleFolder: (folderId: string) => void;
  onDeletePage: (pageId: string, title: string) => void | Promise<void>;
  onDeleteFolder: (folderId: string, title: string) => void | Promise<void>;
  onRenameFolder: (folderId: string, title: string) => void | Promise<void>;
  onCreatePage: (title: string, parentNodeId?: string | null) => Promise<void>;
  onExportPage: (pageId: string, title: string, format: ExportFormat) => void;
  onMoveNode: (sourceId: string, targetId: string) => void | Promise<void>;
  onMoveNodeToRoot?: (sourceId: string) => void | Promise<void>;
  dragSourceId: string | null;
  dragOverNodeId: string | null;
  dragOverPosition: 'inside' | 'unsupported' | null;
  setDragSourceId?: Dispatch<SetStateAction<string | null>>;
  setDragOverNodeId?: Dispatch<SetStateAction<string | null>>;
  setDragOverPosition?: Dispatch<SetStateAction<'inside' | 'unsupported' | null>>;
  spaceId: string;
  onCreateFolder: (title: string, parentNodeId?: string | null) => Promise<void>;
  onCreateFromTemplate: (parentNodeId?: string | null) => void;
}) {
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [createMode, setCreateMode] = useState<'page' | 'folder' | null>(null);
  const [isCreatingPage, setIsCreatingPage] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createError, setCreateError] = useState('');
  const [contextMenuPosition, setContextMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const hasChildren = node.children.length > 0;
  const isFolder = isWorkspaceFolder(node);
  const isExpandable = isFolder;
  const isExpanded = isExpandable ? expandedFolderIds.has(node.id) : false;
  const isActivePage = node.linkedPageId === activePageId;
  const isSelectedTable = node.kind === 'mwsTable' && node.id === selectedTableNodeId;
  const isPinnedPage = node.kind === 'wikiPage' && Boolean(node.linkedPageId && pinnedPageIds.has(node.linkedPageId));
  const canDeletePage = node.wikiPage?.role === 'owner';
  const canOpenActionsMenu = shouldShowWorkspacePageActions(node);
  const shareUrl = node.kind === 'wikiPage' && node.linkedPageId ? getShareUrl(spaceId, node.linkedPageId) : undefined;
  const isMovableNode = isWorkspaceMovableNode(node);
  const canAcceptDrop = canAcceptWorkspaceDrop(node);
  const itemPadding = 8 + depth * 22;

  const closeActionsMenu = useCallback(() => {
    setIsActionsMenuOpen(false);
    setCreateMode(null);
    setIsCreatingPage(false);
    setIsCreatingFolder(false);
    setCreateTitle('');
    setCreateError('');
    setContextMenuPosition(null);
  }, []);

  useEffect(() => {
    if (!isActionsMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        closeActionsMenu();
      }
    };

    const handleWheel = () => {
      closeActionsMenu();
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('wheel', handleWheel, { passive: true });

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [closeActionsMenu, isActionsMenuOpen]);

  useEffect(() => {
    if (!createMode) {
      return;
    }

    createInputRef.current?.focus();
  }, [createMode]);

  const openCreatePageMode = () => {
    setCreateError('');
    setCreateTitle('');
    setCreateMode('page');
  };

  const openCreateFolderMode = () => {
    setCreateError('');
    setCreateTitle('');
    setCreateMode('folder');
  };

  const handleCreatePageSubmit = async () => {
    const normalizedTitle = createTitle.trim();

    if (!normalizedTitle) {
      setCreateError('Введите название страницы');
      return;
    }

    setCreateError('');
    setIsCreatingPage(true);

    try {
      await onCreatePage(normalizedTitle, isFolder ? node.id : node.parentId ?? null);
      closeActionsMenu();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Не удалось создать страницу');
      setIsCreatingPage(false);
    }
  };

  const handleCreateFolderSubmit = async () => {
    const normalizedTitle = createTitle.trim();

    if (!normalizedTitle) {
      setCreateError('Введите название папки');
      return;
    }

    setCreateError('');
    setIsCreatingFolder(true);

    try {
      await onCreateFolder(normalizedTitle, node.id);
      closeActionsMenu();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Не удалось создать папку');
      setIsCreatingFolder(false);
    }
  };

  const openActionsMenuAtButton = (event: React.MouseEvent<HTMLButtonElement>) => {
    const menuWidth = 176;
    const menuHeight = 224;
    const rect = event.currentTarget.getBoundingClientRect();
    const position = calculateContextMenuPosition(rect, menuWidth, menuHeight);

    setCreateMode(null);
    setCreateError('');
    setCreateTitle('');
    setContextMenuPosition(position);
    setIsActionsMenuOpen(true);
  };

  const openActionsMenuAtCursor = (event: React.MouseEvent) => {
    const menuWidth = 176;
    const menuHeight = 224;
    const rect = new DOMRect(event.clientX, event.clientY, 0, 0);
    const position = calculateContextMenuPosition(rect, menuWidth, menuHeight);

    setCreateMode(null);
    setCreateError('');
    setCreateTitle('');
    setContextMenuPosition(position);
    setIsActionsMenuOpen(true);
  };

  return (
    <li className="treeItemRoot relative" tabIndex={-1}>
      {dragOverNodeId === node.id && dragOverPosition === 'inside' ? (
        <div className="pointer-events-none absolute inset-[3px] rounded-md border border-dashed border-[#d70032] bg-[#fff1f3]/70" />
      ) : null}
      {dragOverNodeId === node.id && dragOverPosition === 'unsupported' ? (
        <div className="pointer-events-none absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-lg border border-[#e5e7eb] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#4b5563] shadow-[0_8px_24px_rgba(15,23,42,0.12)]">
          Манипуляции с этим типом не поддерживаются
        </div>
      ) : null}
      <div
        className={[
          'group flex h-8 items-center rounded-md pr-1 text-sm transition-colors',
              node.kind === 'wikiPage' ? 'text-[#303030] hover:bg-[#f2f3f5]' : 'text-[#4d4d4d] hover:bg-[#f2f3f5]',
          isActivePage ? 'bg-[#fff1f3] font-semibold text-[#d70032]' : '',
          isSelectedTable ? 'bg-[#f2f3f5] font-semibold text-[#1f1f1f]' : '',
          dragOverNodeId === node.id && dragOverPosition === 'inside' ? 'bg-[#ffe7ec] ring-1 ring-[#d70032]' : '',
          dragOverNodeId === node.id && dragOverPosition === 'unsupported' ? 'bg-[#f8fafc] ring-1 ring-[#d1d5db]' : '',
        ].join(' ')}
        style={{ paddingLeft: itemPadding }}
        data-test-id="workspaceTreeNodeItem"
        onContextMenu={(event) => {
          if (!canOpenActionsMenu) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          openActionsMenuAtCursor(event);
        }}
      >
        {isExpandable ? (
          <button
            type="button"
            aria-label={isExpanded ? `Свернуть ${node.title}` : `Раскрыть ${node.title}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFolder(node.id);
            }}
            className="mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[#a8a8a8] hover:bg-white"
          >
            {isExpanded ? <ChevronDown size={14} strokeWidth={2.4} /> : <ChevronRight size={14} strokeWidth={2.4} />}
          </button>
        ) : (
          <span className="mr-1 h-5 w-5 shrink-0" />
        )}

        <button
          type="button"
          draggable={isMovableNode}
          onDragStart={(event) => {
            if (!isMovableNode) {
              event.preventDefault();
              return;
            }

            setDragSourceId?.(node.id);
            event.dataTransfer.setData('application/x-wikilive-node-id', node.id);

            if (shareUrl) {
              event.dataTransfer.setData('text/uri-list', shareUrl);
              event.dataTransfer.setData('text/plain', shareUrl);
              event.dataTransfer.setData('text/html', `<a href="${shareUrl}">${node.title}</a>`);
              event.dataTransfer.effectAllowed = 'copyMove';
            } else {
              event.dataTransfer.effectAllowed = 'move';
            }
          }}
          onDragOver={(event) => {
            if (!dragSourceId || dragSourceId === node.id) {
              return;
            }

            event.preventDefault();
            event.dataTransfer.dropEffect = canAcceptDrop ? 'move' : 'none';
            setDragOverNodeId?.(node.id);
            setDragOverPosition?.(canAcceptDrop ? 'inside' : 'unsupported');
          }}
          onDragEnter={(event) => {
            if (!dragSourceId || dragSourceId === node.id) {
              return;
            }

            event.preventDefault();
            setDragOverNodeId?.(node.id);
            setDragOverPosition?.(canAcceptDrop ? 'inside' : 'unsupported');
          }}
          onDragLeave={() => {
            if (dragOverNodeId === node.id) {
              setDragOverNodeId?.(null);
              setDragOverPosition?.(null);
            }
          }}
          onDrop={(event) => {
            const sourceId = dragSourceId ?? event.dataTransfer.getData('application/x-wikilive-node-id');
            if (!sourceId || sourceId === node.id) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();

            if (!canAcceptDrop) {
              void onMoveNodeToRoot?.(sourceId);
              return;
            }

            void onMoveNode(sourceId, node.id);
          }}
          onDragEnd={() => {
            setDragSourceId?.(null);
            setDragOverNodeId?.(null);
            setDragOverPosition?.(null);
          }}
          onClick={() => {
            if (node.kind === 'wikiPage' && node.wikiPage?.isLocked) {
              return;
            }

            if (node.kind === 'wikiPage' && node.linkedPageId) {
              onSelectPage(node.linkedPageId);
              return;
            }

            if (node.kind === 'mwsTable') {
              onSelectMwsTable(node);
              return;
            }

            if (isExpandable) {
              onToggleFolder(node.id);
            }
          }}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          title={
            node.kind === 'wikiPage' && node.wikiPage?.isLocked
              ? 'У вас нет прав для доступа к документу, запросите их у владельца'
              : !isMovableNode
                ? 'Этот тип узла нельзя перемещать'
                : undefined
          }
        >
          <span
            className={[
              node.kind === 'mwsFolder' || node.kind === 'wikiFolder' ? 'text-[#df9b50]' : '',
              node.kind === 'mwsTable' ? 'text-[#d70032]' : '',
              node.kind === 'wikiPage' ? 'text-[#7a7f88]' : '',
            ].join(' ')}
          >
            {getWorkspaceNodeIcon(node)}
          </span>
          <span className="flex min-w-0 items-center gap-1 truncate">
            {isPinnedPage ? <span className="shrink-0 text-[#d70032]">★</span> : null}
            <span className="truncate">{node.title}</span>
          </span>
        </button>

        {canOpenActionsMenu ? (
          <div ref={actionsMenuRef} className="relative ml-1 shrink-0">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (isActionsMenuOpen) {
                  closeActionsMenu();
                  return;
                }

                openActionsMenuAtButton(event);
              }}
              className="flex h-6 w-6 items-center justify-center rounded text-[#b6b6b6] opacity-0 transition-opacity hover:bg-[#f2f3f5] hover:text-[#1f1f1f] group-hover:opacity-100"
              title="Действия"
              aria-label={`Действия для узла ${node.title}`}
              aria-haspopup="menu"
              aria-expanded={isActionsMenuOpen}
            >
              <MoreHorizontal size={14} strokeWidth={2.2} />
            </button>

            <WorkspacePageActionsMenu
              nodeKind={node.kind === 'wikiFolder' || node.kind === 'mwsFolder' ? node.kind : 'wikiPage'}
              title={node.title}
              linkedPageId={node.linkedPageId ?? undefined}
              canDeletePage={Boolean(canDeletePage)}
              canRenameFolder={node.kind === 'wikiFolder'}
              canDeleteFolder={node.kind === 'wikiFolder'}
              isOpen={isActionsMenuOpen}
              createMode={createMode}
              isCreatingPage={isCreatingPage}
              isCreatingFolder={isCreatingFolder}
              createTitle={createTitle}
              createError={createError}
              contextMenuPosition={contextMenuPosition}
              createInputRef={createInputRef}
              isPinned={Boolean(node.linkedPageId && pinnedPageIds.has(node.linkedPageId))}
              onTogglePinned={() => {
                if (node.linkedPageId) {
                  onTogglePinnedPage(node.linkedPageId);
                }
              }}
              onCloseActionsMenu={closeActionsMenu}
              onOpenCreatePageMode={openCreatePageMode}
              onOpenCreateFolderMode={isFolder ? openCreateFolderMode : undefined}
              onOpenTemplateMarketplace={isFolder ? () => {
                closeActionsMenu();
                onCreateFromTemplate(node.id);
              } : undefined}
              onCreateTitleChange={setCreateTitle}
              onCreatePageSubmit={() => void handleCreatePageSubmit()}
              onCreateFolderSubmit={isFolder ? () => void handleCreateFolderSubmit() : undefined}
              onCancelCreateMode={() => {
                setCreateMode(null);
                setCreateError('');
              }}
              onDeletePage={() => onDeletePage(node.linkedPageId!, node.title)}
              onExport={node.linkedPageId ? (format) => onExportPage(node.linkedPageId!, node.title, format) : undefined}
              onRenameFolder={node.kind === 'wikiFolder' ? () => void onRenameFolder(node.id, node.title) : undefined}
              onDeleteFolder={node.kind === 'wikiFolder' ? () => void onDeleteFolder(node.id, node.title) : undefined}
            />
          </div>
        ) : null}
      </div>

      {isExpandable && isExpanded && hasChildren ? (
        <ul className="group" role="group" aria-labelledby="tree_label">
          {node.children.map((child) => (
            <WorkspaceTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              activePageId={activePageId}
              selectedTableNodeId={selectedTableNodeId}
              expandedFolderIds={expandedFolderIds}
              pinnedPageIds={pinnedPageIds}
              onTogglePinnedPage={onTogglePinnedPage}
              onSelectPage={onSelectPage}
              onSelectMwsTable={onSelectMwsTable}
              onToggleFolder={onToggleFolder}
              onDeletePage={onDeletePage}
              onDeleteFolder={onDeleteFolder}
              onRenameFolder={onRenameFolder}
              onCreatePage={onCreatePage}
              onExportPage={onExportPage}
              onMoveNode={onMoveNode}
              dragSourceId={dragSourceId}
              dragOverNodeId={dragOverNodeId}
              dragOverPosition={dragOverPosition}
              setDragSourceId={setDragSourceId}
              setDragOverNodeId={setDragOverNodeId}
              setDragOverPosition={setDragOverPosition}
              spaceId={spaceId}
              onCreateFolder={onCreateFolder}
              onCreateFromTemplate={onCreateFromTemplate}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function MwsTableActionModal({
  node,
  isCreating,
  isDeleting,
  onCreatePage,
  onOpenMws,
  onDelete,
  onClose,
}: {
  node: WorkspaceTreeNode | null;
  isCreating: boolean;
  isDeleting: boolean;
  onCreatePage: () => void;
  onOpenMws: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  if (!node) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Действия с таблицей ${node.title}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-editor-border-subtle bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.2)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[#1f1f1f]">{node.title}</h3>
            <p className="mt-1 text-sm text-[#6d7280]">
              Таблица остается живой сущностью MWS. WikiLive может создать рядом страницу с embedded live-таблицей.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-[#7a7f88] hover:bg-[#f2f3f5]"
            aria-label="Закрыть"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={onOpenMws}
            className="w-full rounded-lg border border-editor-border-subtle px-3 py-2 text-sm font-semibold text-[#1f1f1f] hover:bg-[#f7f8fa]"
          >
            Открыть в MWS
          </button>

          <button
            type="button"
            onClick={onCreatePage}
            disabled={isCreating}
            className="w-full rounded-lg bg-[#d70032] px-3 py-2 text-sm font-semibold text-white hover:bg-[#b8002b] disabled:cursor-wait disabled:opacity-70"
          >
            {isCreating ? 'Создаем страницу...' : 'Создать страницу с таблицей'}
          </button>

          <button
            type="button"
            onClick={onDelete}
            disabled={isDeleting}
            className="w-full rounded-lg border border-[#ffd4da] px-3 py-2 text-sm font-semibold text-[#d70032] hover:bg-[#fff1f3] disabled:cursor-wait disabled:opacity-70"
          >
            {isDeleting ? 'Удаляем...' : 'Удалить узел из дерева'}
          </button>
        </div>
      </div>
    </div>
  , document.body);
}

function LogoutConfirmModal({
  displayName,
  isSubmitting,
  onConfirm,
  onClose,
}: {
  displayName: string;
  isSubmitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[101] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <section
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-editor-border-subtle bg-white shadow-[0_20px_60px_rgba(15,23,42,0.25)]"
        role="dialog"
        aria-modal="true"
        aria-label="Подтверждение выхода"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-editor-border-subtle p-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#d70032]">Сессия</p>
            <h3 className="mt-2 font-wide text-xl font-semibold text-[#1f1f1f]">Выйти из WikiLive?</h3>
            <p className="mt-2 text-sm text-editor-text-tertiary">
              {displayName
                ? `Вы вошли как ${displayName}. После выхода потребуется снова ввести API-ключ.`
                : 'После выхода потребуется снова ввести API-ключ.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#8d8d8d] hover:bg-[#f2f3f5] hover:text-[#1f1f1f]"
            aria-label="Закрыть"
          >
            <X size={17} strokeWidth={2.2} />
          </button>
        </div>
        <div className="flex justify-end gap-3 p-5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-xl border border-editor-border-subtle bg-white px-4 py-3 text-sm font-semibold text-[#1f1f1f] transition-colors hover:bg-[#f2f3f5] disabled:opacity-60"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="rounded-xl bg-[#d70032] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#b8002b] disabled:cursor-wait disabled:opacity-60"
          >
            {isSubmitting ? 'Выходим...' : 'Выйти'}
          </button>
        </div>
      </section>
    </div>
  );
}

export function WorkspacePage() {
  const { displayName, handleLogout, handleUpdateDisplayName, isUpdatingDisplayName } = useAuthSessionContext();
  const {
    items: plugins,
    plan,
    isLoading: isPluginsLoading,
    errorMessage: pluginsErrorMessage,
    pendingPluginId,
    togglePlugin,
    updatePluginSettings,
    aiAssistantFeatures,
    toggleAiAssistantFeature,
    isPluginEnabled,
    isWorkspaceSidebarEnabled,
  } = usePlugins();
  const initialRoute = useMemo(() => readWorkspaceRoute(), []);
  const pendingRoutePageIdRef = useRef(initialRoute.pageId);
  const [spaces, setSpaces] = useState<MwsSpace[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState(initialRoute.spaceId ?? DEFAULT_WIKILIVE_SPACE_ID);
  const [tree, setTree] = useState<WorkspaceTreeNode[]>([]);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'inside' | 'unsupported' | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const workbenchTreeWrapperRef = useRef<HTMLDivElement>(null);
  const findNodeAndParent = useCallback(
    (
      nodes: WorkspaceTreeNode[],
      needle: string,
      parent: WorkspaceTreeNode | null = null,
      parentList: WorkspaceTreeNode[] | null = null,
    ): { node: WorkspaceTreeNode; parent: WorkspaceTreeNode | null; parentList: WorkspaceTreeNode[] | null } | null => {
      for (const node of nodes) {
        if (node.id === needle) {
          return { node, parent, parentList: parentList ?? nodes };
        }

        const childMatch = findNodeAndParent(node.children, needle, node, node.children);
        if (childMatch) {
          return childMatch;
        }
      }

      return null;
    },
    [],
  );

  const clearTreeDragState = useCallback(() => {
    setDragOverNodeId(null);
    setDragOverPosition(null);
  }, []);
  const spaceSelectMenuRef = useRef<HTMLDivElement>(null);
  const blankAreaCreateRef = useRef<HTMLDivElement>(null);
  const blankAreaCreateInputRef = useRef<HTMLInputElement>(null);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [selectedTableNode, setSelectedTableNode] = useState<WorkspaceTreeNode | null>(null);
  const [pinnedPageIds, setPinnedPageIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') {
      return new Set();
    }

    try {
      const raw = window.localStorage.getItem('wikilive:pinned-pages');
      const parsed = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem('wikilive:pinned-pages', JSON.stringify(Array.from(pinnedPageIds)));
    } catch {
      // ignore storage errors
    }
  }, [pinnedPageIds]);

  const [activePage, setActivePage] = useState<WikiPage | null>(null);
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [outgoingLinks, setOutgoingLinks] = useState<OutgoingLink[]>([]);
  const [graphEdges, setGraphEdges] = useState<DocumentGraphEdge[]>([]);
  const pageLinkCountRef = useRef<number>(0);
  const graphRefreshTimerRef = useRef<number | null>(null);
  const refreshDocumentGraphRef = useRef<(() => Promise<void>) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingTablePage, setIsCreatingTablePage] = useState(false);
  const [isDeletingTable, setIsDeletingTable] = useState(false);
  const [isDeletingPage, setIsDeletingPage] = useState(false);
  const [isBlankAreaCreateOpen, setIsBlankAreaCreateOpen] = useState(false);
  const [blankAreaCreateMode, setBlankAreaCreateMode] = useState<'page' | 'folder' | null>(null);
  const [isBlankAreaSubmitting, setIsBlankAreaSubmitting] = useState(false);
  const [blankAreaCreateTitle, setBlankAreaCreateTitle] = useState('');
  const [blankAreaCreateError, setBlankAreaCreateError] = useState('');
  const [blankAreaCreatePosition, setBlankAreaCreatePosition] = useState<{ left: number; top: number } | null>(null);
  const [statusMessage, setStatusMessage] = useState('Загружаем wiki workspace');
  const [errorMessage, setErrorMessage] = useState('');
  const [shareStatus, setShareStatus] = useState('');
  const [isPluginsModalOpen, setIsPluginsModalOpen] = useState(false);
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const [documentStateEncoder, setDocumentStateEncoder] = useState<(() => string | null) | null>(null);
  const [documentStateRestorer, setDocumentStateRestorer] = useState<((value: string) => boolean) | null>(null);
  const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>('toolbar');
  const [historyPreviewCheckpoint, setHistoryPreviewCheckpoint] = useState<PageHistoryCheckpoint | null>(null);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isEditingDisplayName, setIsEditingDisplayName] = useState(false);
  const [isSpaceMenuOpen, setIsSpaceMenuOpen] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState(displayName);
  const [isAccessPanelOpen, setIsAccessPanelOpen] = useState(false);
  const [templates, setTemplates] = useState<PageTemplateSummary[]>([]);
  const [templateCategories, setTemplateCategories] = useState<TemplateCategorySummary[]>([]);
  const areTemplateCategoriesLoadedRef = useRef(false);
  const [templateQuery, setTemplateQuery] = useState<TemplateListQuery>({
    scope: 'all',
    sort: 'relevance',
    search: '',
    page: 1,
    pageSize: DEFAULT_TEMPLATE_PAGE_SIZE,
  });
  const templateQueryRef = useRef<TemplateListQuery>({
    scope: 'all',
    sort: 'relevance',
    search: '',
    page: 1,
    pageSize: DEFAULT_TEMPLATE_PAGE_SIZE,
  });
  const [templatePageInfo, setTemplatePageInfo] = useState({
    page: 1,
    pageSize: DEFAULT_TEMPLATE_PAGE_SIZE,
    total: 0,
    hasNextPage: false,
  });
  const [isTemplatesLoading, setIsTemplatesLoading] = useState(true);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [templateTargetParentId, setTemplateTargetParentId] = useState<string | null>(null);
  const [isCreateTemplateModalOpen, setIsCreateTemplateModalOpen] = useState(false);
  const [pendingTemplateSource, setPendingTemplateSource] = useState<{ pageId: string; title: string } | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<PageTemplateSummary | null>(null);
  const [isInstantiatingTemplate, setIsInstantiatingTemplate] = useState(false);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [isDeletingTemplate, setIsDeletingTemplate] = useState(false);
  const [accessDraft, setAccessDraft] = useState<DocumentAccessPolicy | null>(null);
  const [isUpdatingAccess, setIsUpdatingAccess] = useState(false);
  const leftSidebar = useResizableSidebar({
    defaultWidth: LEFT_SIDEBAR_MIN_WIDTH,
    minWidth: LEFT_SIDEBAR_MIN_WIDTH,
    maxWidth: LEFT_SIDEBAR_MAX_WIDTH,
    side: 'left',
  });
  const rightSidebar = useResizableSidebar({
    defaultWidth: RIGHT_SIDEBAR_MIN_WIDTH,
    minWidth: RIGHT_SIDEBAR_MIN_WIDTH,
    maxWidth: RIGHT_SIDEBAR_MAX_WIDTH,
    side: 'right',
  });

  const visibleTree = useMemo(() => filterWorkspaceTree(tree, searchQuery), [searchQuery, tree]);
  const pinnedPages = useMemo(() => findPinnedPages(visibleTree, pinnedPageIds), [visibleTree, pinnedPageIds]);
  const treeWithoutPinnedPages = useMemo(
    () => removePinnedPages(visibleTree, pinnedPageIds),
    [visibleTree, pinnedPageIds],
  );
  const hasSearch = searchQuery.trim().length > 0;
  const longestSpaceNameChars = useMemo(
    () => Math.max(12, ...spaces.map((space) => space.name.length)),
    [spaces],
  );
  const canManageAccess = activePage?.access?.capabilities.canManageAccess ?? false;
  const canEditActivePage = activePage?.access?.capabilities.canEdit ?? true;

  const countPageLinks = useCallback((editor: Editor) => {
    let count = 0;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'pageLink') {
        count += 1;
      }
      return true;
    });
    return count;
  }, []);

  const scheduleGraphRefresh = useCallback(() => {
    if (graphRefreshTimerRef.current) {
      window.clearTimeout(graphRefreshTimerRef.current);
    }

    graphRefreshTimerRef.current = window.setTimeout(() => {
      void refreshDocumentGraphRef.current?.();
      graphRefreshTimerRef.current = null;
    }, 3000);
  }, []);

  const isHistoryPreviewActive = Boolean(historyPreviewCheckpoint);
  const hasAccessChanges = Boolean(
    accessDraft &&
      activePage?.access?.policy &&
      (
        accessDraft.viewAccess !== activePage.access.policy.viewAccess ||
        accessDraft.commentAccess !== activePage.access.policy.commentAccess ||
        accessDraft.editAccess !== activePage.access.policy.editAccess
      ),
  );
  const isDocumentGraphEnabled = isWorkspaceSidebarEnabled('document-graph');
  const isCommentsEnabled = isPluginEnabled('comments');

  useEffect(() => {
    if (!activeEditor) {
      return;
    }

    const initialCount = countPageLinks(activeEditor);
    pageLinkCountRef.current = initialCount;

    const handleTransaction = () => {
      const currentCount = countPageLinks(activeEditor);
      if (currentCount !== pageLinkCountRef.current) {
        pageLinkCountRef.current = currentCount;
        scheduleGraphRefresh();
      }
    };

    activeEditor.on('transaction', handleTransaction);

    return () => {
      activeEditor.off('transaction', handleTransaction);
      if (graphRefreshTimerRef.current) {
        window.clearTimeout(graphRefreshTimerRef.current);
        graphRefreshTimerRef.current = null;
      }
    };
  }, [activeEditor, countPageLinks, scheduleGraphRefresh]);
  const isTimeMachineEnabled = isPluginEnabled('time-machine');
  const isNavigationEnabled = isWorkspaceSidebarEnabled('navigation');
  const isAiSidebarEnabled = isWorkspaceSidebarEnabled('sidebar');
  const [isScreenNarrow, setIsScreenNarrow] = useState(false);
  const [isWhatsNewBannerVisible, setIsWhatsNewBannerVisible] = useState(false);
  const [whatsNewBannerSecondsLeft, setWhatsNewBannerSecondsLeft] = useState(WHATS_NEW_BANNER_DURATION_SEC);

  const closeWhatsNewBanner = useCallback(() => {
    setIsWhatsNewBannerVisible(false);
  }, []);

  const disableWhatsNewBanner = useCallback(() => {
    try {
      window.localStorage.setItem(WHATS_NEW_BANNER_STORAGE_KEY, '1');
    } catch {
      // Ignore localStorage errors and just hide the banner for this runtime session.
    }

    setIsWhatsNewBannerVisible(false);
  }, []);

  useEffect(() => {
    if (!isSpaceMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (spaceSelectMenuRef.current && !spaceSelectMenuRef.current.contains(event.target as Node)) {
        setIsSpaceMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isSpaceMenuOpen]);

  useEffect(() => {
    const updateRightSidebarVisibility = () => {
      const narrow = window.innerWidth < 800;
      setIsScreenNarrow(narrow);

      if (narrow) {
        setRightPanelMode('toolbar');
        rightSidebar.collapse();
      }
    };

    updateRightSidebarVisibility();
    window.addEventListener('resize', updateRightSidebarVisibility);

    return () => {
      window.removeEventListener('resize', updateRightSidebarVisibility);
    };
  }, [rightSidebar]);

  useEffect(() => {
    if (!WHATS_NEW_BANNER_ENABLED) {
      return;
    }

    try {
      if (window.localStorage.getItem(WHATS_NEW_BANNER_STORAGE_KEY) === '1') {
        return;
      }
    } catch {
      // Ignore localStorage read errors and show banner by default.
    }

    setWhatsNewBannerSecondsLeft(WHATS_NEW_BANNER_DURATION_SEC);
    setIsWhatsNewBannerVisible(true);
  }, []);

  useEffect(() => {
    if (!isWhatsNewBannerVisible) {
      return;
    }

    const timer = window.setInterval(() => {
      setWhatsNewBannerSecondsLeft((previous) => {
        if (previous <= 1) {
          window.clearInterval(timer);
          setIsWhatsNewBannerVisible(false);
          return 0;
        }

        return previous - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isWhatsNewBannerVisible]);

  const comments = usePageComments({
    pageId: activePageId,
    editor: activeEditor,
    enabled: isCommentsEnabled && Boolean(activePage),
  });
  const {
    startThreadFromSelection,
    openThread,
    closePanel: closeCommentsPanel,
  } = comments;
  const editorCommentThreads = useMemo<CommentThreadView[]>(() => {
    if (!comments.activeThread?.isDraft) {
      return comments.openThreads;
    }

    return [comments.activeThread, ...comments.openThreads.filter((thread) => thread.id !== comments.activeThread?.id)];
  }, [comments.activeThread, comments.openThreads]);
  const effectiveExpandedFolderIds = useMemo(
    () => (hasSearch ? new Set(collectWorkspaceFolderIds(visibleTree)) : expandedFolderIds),
    [expandedFolderIds, hasSearch, visibleTree],
  );

  const refreshGraphLinks = useCallback(async (nodes: WorkspaceTreeNode[]) => {
    const pages = flattenWorkspacePages(nodes);
    const responses = await Promise.all(
      pages.map(async (page) => {
        const response = await wikiliveApi.getOutgoingLinks(page.id);

        return response.items.map((link) => ({
          sourcePageId: page.id,
          targetPageId: link.targetPageId,
          mentionCount: link.mentionCount,
        }));
      }),
    );

    setGraphEdges(responses.flat());
  }, []);

  const refreshTree = useCallback(
    async (spaceId: string, preferredPageId?: string | null) => {
      const response = await wikiliveApi.getWorkspaceTree(spaceId);
      const nextTree = response.items;
      const pages = flattenWorkspacePages(nextTree);
      let nextActivePageId: string | null = null;

      if (preferredPageId) {
        nextActivePageId = preferredPageId;
      } else if (!nextActivePageId || !pages.some((page) => page.id === nextActivePageId)) {
        nextActivePageId = pages[0]?.id ?? null;
      }

      setTree(nextTree);
      setActivePageId(nextActivePageId);
      setExpandedFolderIds((current) => {
        const nextIds = new Set(current);
        collectWorkspaceFolderIds(nextTree).forEach((folderId) => nextIds.add(folderId));
        return nextIds;
      });
      await refreshGraphLinks(nextTree).catch(() => setGraphEdges([]));

      return nextActivePageId;
    },
    [refreshGraphLinks],
  );

  const moveTreeNode = useCallback(
    async (sourceId: string, targetId: string) => {
      if (sourceId === targetId) {
        return;
      }

      const sourceInfo = findNodeAndParent(tree, sourceId);
      const targetInfo = findNodeAndParent(tree, targetId);

      if (!sourceInfo || !targetInfo) {
        clearTreeDragState();
        return;
      }

      if (!isWorkspaceMovableNode(sourceInfo.node)) {
        setErrorMessage('Можно перемещать только локальные страницы и папки');
        clearTreeDragState();
        return;
      }

      if (!canAcceptWorkspaceDrop(targetInfo.node)) {
        setErrorMessage('Манипуляции с объектом данного типа не поддерживаются');
        clearTreeDragState();
        return;
      }

      const movingIntoDescendant = Boolean(findNodeAndParent(sourceInfo.node.children ?? [], targetId));
      if (movingIntoDescendant) {
        setErrorMessage('Нельзя переместить папку внутрь самой себя');
        clearTreeDragState();
        return;
      }

      try {
        if (targetInfo.node.kind === 'mwsFolder') {
          await wikiliveApi.moveNode(sourceId, {
            targetParentId: null,
            targetExternalParentNodeId: targetInfo.node.mwsNode?.id ?? null,
          });
        } else {
          await wikiliveApi.moveNode(sourceId, {
            targetParentId: targetInfo.node.id,
            targetExternalParentNodeId: null,
          });
        }

        setErrorMessage('');
        await refreshTree(selectedSpaceId, activePageId);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Не удалось переместить объект');
      } finally {
        clearTreeDragState();
        setDragSourceId(null);
      }
    },
    [activePageId, clearTreeDragState, findNodeAndParent, refreshTree, selectedSpaceId, tree],
  );

  const moveTreeNodeToRoot = useCallback(
    async (sourceId: string) => {
      const sourceInfo = findNodeAndParent(tree, sourceId);

      if (!sourceInfo) {
        clearTreeDragState();
        setDragSourceId(null);
        return;
      }

      if (!isWorkspaceMovableNode(sourceInfo.node)) {
        setErrorMessage('Можно перемещать только локальные страницы и папки');
        clearTreeDragState();
        setDragSourceId(null);
        return;
      }

      try {
        await wikiliveApi.moveNode(sourceId, {
          targetParentId: null,
          targetExternalParentNodeId: null,
        });

        setErrorMessage('');
        await refreshTree(selectedSpaceId, activePageId);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Не удалось переместить объект');
      } finally {
        clearTreeDragState();
        setDragSourceId(null);
      }
    },
    [activePageId, clearTreeDragState, findNodeAndParent, refreshTree, selectedSpaceId, tree],
  );

  const refreshDocumentGraph = useCallback(async () => {
    if (tree.length === 0) {
      return;
    }

    await refreshGraphLinks(tree);
  }, [refreshGraphLinks, tree]);

  useEffect(() => {
    refreshDocumentGraphRef.current = refreshDocumentGraph;
  }, [refreshDocumentGraph]);

  const refreshLinks = async (pageId: string) => {
    const [backlinksResponse, outgoingResponse] = await Promise.all([
      wikiliveApi.getBacklinks(pageId),
      wikiliveApi.getOutgoingLinks(pageId),
    ]);

    setBacklinks(backlinksResponse.items);
    setOutgoingLinks(outgoingResponse.items);
  };

  const refreshActivePage = async (pageId: string) => {
    const response = await wikiliveApi.getPage(pageId);
    setActivePage(response.page);
    await refreshLinks(pageId);
  };

  const applyPageAccessUpdate = useCallback(
    async (pageId: string) => {
      await refreshTree(selectedSpaceId, activePageId);

      if (activePageId === pageId) {
        try {
          await refreshActivePage(pageId);
        } catch (error) {
          setActivePage(null);
          setErrorMessage(error instanceof Error ? error.message : 'Не удалось обновить статус доступа к документу');
        }
      }
    },
    [activePageId, refreshTree, selectedSpaceId],
  );

  const applyPageUpdate = useCallback(
    async (pageId: string) => {
      await refreshTree(selectedSpaceId, activePageId);

      if (activePageId === pageId) {
        try {
          await refreshActivePage(pageId);
        } catch (error) {
          setErrorMessage(error instanceof Error ? error.message : 'Не удалось обновить настройки документа');
        }
      }
    },
    [activePageId, refreshTree, selectedSpaceId],
  );

  const history = usePageHistory({
    pageId: activePageId,
    enabled: isTimeMachineEnabled && Boolean(activePage) && rightPanelMode === 'timeMachine',
    getDocumentStateValue: documentStateEncoder,
    applyDocumentStateValue: documentStateRestorer,
    onRestored: async () => {
      setHistoryPreviewCheckpoint(null);
      if (activePageId) {
        await Promise.all([
          refreshActivePage(activePageId),
          refreshTree(selectedSpaceId, activePageId),
          isCommentsEnabled ? comments.refreshComments(true) : Promise.resolve(),
        ]);
      }
    },
  });

  useEffect(() => {
    if (rightPanelMode !== 'timeMachine') {
      setHistoryPreviewCheckpoint(null);
    }
  }, [rightPanelMode]);

  const closeRightSidebar = useCallback(() => {
    setRightPanelMode('toolbar');
    rightSidebar.collapse();
  }, [rightSidebar]);

  useEffect(() => {
    if (!isNavigationEnabled && rightPanelMode === 'navigation') {
      setRightPanelMode('toolbar');
    }
  }, [isNavigationEnabled, rightPanelMode]);

  useEffect(() => {
    if (!isAiSidebarEnabled && rightPanelMode === 'chat') {
      setRightPanelMode('toolbar');
    }
  }, [isAiSidebarEnabled, rightPanelMode]);

  useEffect(() => {
    setHistoryPreviewCheckpoint(null);
  }, [activePageId]);

  useEffect(() => {
    setDisplayNameDraft(displayName);
  }, [displayName]);

  useEffect(() => {
    let cancelled = false;

    void wikiliveApi
      .listMwsSpaces()
      .then((response) => {
        if (cancelled) {
          return;
        }

        const nextSpaces = response.items.length > 0 ? response.items : [{ id: DEFAULT_WIKILIVE_SPACE_ID, name: DEFAULT_WIKILIVE_SPACE_ID }];
        const storedSpaceId = localStorage.getItem(SELECTED_SPACE_STORAGE_KEY);
        const routeSpaceId = initialRoute.spaceId;
        const nextSpaceId = resolveAccessibleSpaceId(
          nextSpaces,
          routeSpaceId,
          storedSpaceId,
          DEFAULT_WIKILIVE_SPACE_ID,
          initialRoute.pageId,
        );

        setSpaces(nextSpaces);
        setSelectedSpaceId(nextSpaceId ?? DEFAULT_WIKILIVE_SPACE_ID);

        if (nextSpaceId && nextSpaceId !== routeSpaceId) {
          writeWorkspaceRoute(nextSpaceId, null, 'replace');
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setSpaces([{ id: DEFAULT_WIKILIVE_SPACE_ID, name: DEFAULT_WIKILIVE_SPACE_ID }]);
        setSelectedSpaceId(DEFAULT_WIKILIVE_SPACE_ID);
        setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить пространства MWS Tables');
      });

    return () => {
      cancelled = true;
    };
  }, [initialRoute.spaceId]);

  const refreshTemplates = useCallback(async (spaceId: string, overrides?: Partial<TemplateListQuery>) => {
    setIsTemplatesLoading(true);

    const currentQuery = templateQueryRef.current;
    const nextQuery: TemplateListQuery = {
      ...currentQuery,
      ...overrides,
      spaceId,
      page: overrides?.page ?? currentQuery.page ?? 1,
      pageSize: overrides?.pageSize ?? currentQuery.pageSize ?? DEFAULT_TEMPLATE_PAGE_SIZE,
    };

    try {
      const templatesResponse = await wikiliveApi.listTemplates(nextQuery);
      templateQueryRef.current = nextQuery;
      setTemplateQuery(nextQuery);
      setTemplates(templatesResponse.items);
      setTemplatePageInfo(templatesResponse.pageInfo);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить шаблоны');
    } finally {
      setIsTemplatesLoading(false);
    }
  }, []);

  const ensureTemplateCategoriesLoaded = useCallback(async () => {
    if (areTemplateCategoriesLoadedRef.current) {
      return;
    }

    const response = await wikiliveApi.listTemplateCategories();
    setTemplateCategories(response.items);
    areTemplateCategoriesLoadedRef.current = true;
  }, []);

  useEffect(() => {
    void ensureTemplateCategoriesLoaded().catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить категории шаблонов');
    });
    void refreshTemplates(selectedSpaceId, {
      scope: 'all',
      sort: 'relevance',
      search: '',
      categoryId: undefined,
      page: 1,
      pageSize: DEFAULT_TEMPLATE_PAGE_SIZE,
    });
  }, [ensureTemplateCategoriesLoaded, refreshTemplates, selectedSpaceId]);

  useEffect(() => {
    let cancelled = false;

    if (!selectedSpaceId) {
      return;
    }

    localStorage.setItem(SELECTED_SPACE_STORAGE_KEY, selectedSpaceId);
    setActivePage(null);
    setIsPageLoading(false);
    setActivePageId(pendingRoutePageIdRef.current);
    setSelectedTableNode(null);
    setBacklinks([]);
    setOutgoingLinks([]);
    setSearchQuery('');

    void (async () => {
      try {
        setIsLoading(true);
        setErrorMessage('');
        setStatusMessage('Загружаем wiki workspace');
        const preferredPageId = pendingRoutePageIdRef.current;
        pendingRoutePageIdRef.current = null;
        await refreshTree(selectedSpaceId, preferredPageId);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить wiki workspace');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setStatusMessage('');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshTree, selectedSpaceId]);

  useEffect(() => {
    if (!isDocumentGraphEnabled) {
      setGraphEdges([]);
      return;
    }

    if (tree.length === 0) {
      setGraphEdges([]);
      return;
    }

    void refreshGraphLinks(tree).catch(() => setGraphEdges([]));
  }, [isDocumentGraphEnabled, refreshGraphLinks, tree]);

  useEffect(() => {
    const handlePopState = () => {
      const route = readWorkspaceRoute();

      if (route.spaceId && route.spaceId !== selectedSpaceId) {
        pendingRoutePageIdRef.current = route.pageId;
        setSelectedSpaceId(route.spaceId);
        return;
      }

      if (route.pageId) {
        setSelectedTableNode(null);
        setActivePageId(route.pageId);
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [selectedSpaceId]);

  useEffect(() => {
    setAccessDraft(
      activePage?.access?.policy
        ? {
            ownerUserId: activePage.access.policy.ownerUserId,
            viewAccess: activePage.access.policy.viewAccess,
            commentAccess: activePage.access.policy.commentAccess,
            editAccess: activePage.access.policy.editAccess,
          }
        : null,
    );
  }, [activePage?.access?.policy]);

  useEffect(() => {
    if (!selectedSpaceId) {
      return;
    }

    const channel = wikiliveApi.openWorkspaceRealtime(selectedSpaceId, {
      onMessage: (event: WorkspaceRealtimeEvent) => {
        if (event.type === 'page_access_updated') {
          void applyPageAccessUpdate(event.pageId);
        }

        if (event.type === 'page_updated') {
          void applyPageUpdate(event.pageId);
        }
      },
    });

    return () => {
      channel.close();
    };
  }, [applyPageAccessUpdate, applyPageUpdate, selectedSpaceId]);

  useEffect(() => {
    if (!selectedSpaceId) {
      return;
    }

    writeWorkspaceRoute(selectedSpaceId, activePageId, 'replace');
  }, [activePageId, selectedSpaceId]);

  useEffect(() => {
    if (!activePageId) {
      setActivePage(null);
      setIsPageLoading(false);
      setRightPanelMode('toolbar');
      return;
    }

    let cancelled = false;
    setActivePage(null);
    setIsPageLoading(true);
    setStatusMessage('Открываем страницу');

    void (async () => {
      try {
        setErrorMessage('');
        const response = await wikiliveApi.getPage(activePageId);

        if (cancelled) {
          return;
        }

        setActivePage(response.page);
        await refreshLinks(activePageId);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Не удалось открыть страницу');
        }
      } finally {
        if (!cancelled) {
          setIsPageLoading(false);
          setStatusMessage('');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activePageId]);

  const handleSelectPage = (pageId: string) => {
    if (pageId === activePageId && !selectedTableNode) {
      return;
    }

    setSelectedTableNode(null);
    setActivePage(null);
    setActivePageId(pageId);
    writeWorkspaceRoute(selectedSpaceId, pageId, 'push');
  };

  const handleTogglePinnedPage = useCallback((pageId: string) => {
    setPinnedPageIds((previous) => {
      const next = new Set(previous);

      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }

      return next;
    });
  }, []);

  const handleSelectSpace = (spaceId: string) => {
    pendingRoutePageIdRef.current = null;
    setSelectedSpaceId(spaceId);
    setIsSpaceMenuOpen(false);
    writeWorkspaceRoute(spaceId, null, 'push');
  };

  const handleCopyShareLink = async () => {
    const shareUrl = getShareUrl(selectedSpaceId, activePageId);

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareStatus('Ссылка скопирована');
    } catch {
      window.prompt('Ссылка на текущую страницу', shareUrl);
      setShareStatus('Ссылка готова');
    }

    window.setTimeout(() => setShareStatus(''), 2200);
  };

  const handleToggleFolder = (folderId: string) => {
    setExpandedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }

      return next;
    });
  };

  const handleSelectMwsTable = (node: WorkspaceTreeNode) => {
    setSelectedTableNode(node);
  };

  const closeBlankAreaCreate = useCallback(() => {
    setIsBlankAreaCreateOpen(false);
    setBlankAreaCreateMode(null);
    setIsBlankAreaSubmitting(false);
    setBlankAreaCreateTitle('');
    setBlankAreaCreateError('');
    setBlankAreaCreatePosition(null);
  }, []);

  const openTemplateMarketplace = useCallback((parentNodeId?: string | null) => {
    setTemplateTargetParentId(parentNodeId ?? null);
    setIsTemplateModalOpen(true);
    void ensureTemplateCategoriesLoaded().catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить категории шаблонов');
    });
    void refreshTemplates(selectedSpaceId, { page: 1 });
    closeBlankAreaCreate();
  }, [closeBlankAreaCreate, ensureTemplateCategoriesLoaded, refreshTemplates, selectedSpaceId]);

  const handleCreatePage = async (title?: string, parentNodeId?: string | null) => {
    const normalizedTitle = title?.trim();
    const resolvedTitle =
      normalizedTitle && normalizedTitle.length > 0
        ? normalizedTitle
        : `Страница ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
    setStatusMessage('Создаем страницу');

    try {
      const created = await wikiliveApi.createPage(selectedSpaceId, resolvedTitle, parentNodeId);
      await refreshTree(selectedSpaceId, created.page.id);
      setActivePageId(created.page.id);
      writeWorkspaceRoute(selectedSpaceId, created.page.id, 'push');
      return { ok: true as const, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось создать страницу';
      setErrorMessage(message);
      return { ok: false as const, error: message };
    } finally {
      setStatusMessage('');
    }
  };

  const handleCreateFolder = async (title?: string, parentNodeId?: string | null) => {
    const normalizedTitle = title?.trim();
    const resolvedTitle =
      normalizedTitle && normalizedTitle.length > 0
        ? normalizedTitle
        : `Папка ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
    setStatusMessage('Создаем папку');

    try {
      await wikiliveApi.createFolder({
        spaceId: selectedSpaceId,
        title: resolvedTitle,
        parentNodeId: parentNodeId ?? null,
      });
      await refreshTree(selectedSpaceId, activePageId);
      return { ok: true as const, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось создать папку';
      setErrorMessage(message);
      return { ok: false as const, error: message };
    } finally {
      setStatusMessage('');
    }
  };

  const handleBlankAreaCreateSubmit = useCallback(async () => {
    const normalizedTitle = blankAreaCreateTitle.trim();
    const targetLabel = blankAreaCreateMode === 'folder' ? 'папки' : 'страницы';

    if (!normalizedTitle) {
      setBlankAreaCreateError(`Введите название ${targetLabel}`);
      return;
    }

    setBlankAreaCreateError('');
    setIsBlankAreaSubmitting(true);

    const result =
      blankAreaCreateMode === 'folder'
        ? await handleCreateFolder(normalizedTitle, null)
        : await handleCreatePage(normalizedTitle, null);

    if (result.ok) {
      closeBlankAreaCreate();
      return;
    }

    setBlankAreaCreateError(
      result.error || (blankAreaCreateMode === 'folder' ? 'Не удалось создать папку' : 'Не удалось создать страницу'),
    );
    setIsBlankAreaSubmitting(false);
  }, [blankAreaCreateMode, blankAreaCreateTitle, closeBlankAreaCreate, handleCreateFolder, handleCreatePage]);

  const openBlankAreaCreateMode = useCallback((mode: 'page' | 'folder') => {
    setBlankAreaCreateTitle('');
    setBlankAreaCreateError('');
    setBlankAreaCreateMode(mode);
  }, []);

  const handleWorkbenchBlankAreaContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isLoading) {
        return;
      }

      const target = event.target as HTMLElement | null;

      if (
        target?.closest('[data-test-id="workspaceTreeNodeItem"]') ||
        target?.closest('[data-workspace-inline-create="true"]')
      ) {
        return;
      }

      event.preventDefault();

      const menuWidth = 236;
      const menuHeight = 180;
      const rect = new DOMRect(event.clientX, event.clientY, 0, 0);
      const position = calculateContextMenuPosition(rect, menuWidth, menuHeight);

      setBlankAreaCreateTitle('');
      setBlankAreaCreateError('');
      setBlankAreaCreatePosition(position);
      setIsBlankAreaCreateOpen(true);
      setBlankAreaCreateMode(null);
    },
    [isLoading],
  );

  useEffect(() => {
    if (!isBlankAreaCreateOpen || !blankAreaCreateMode) {
      return;
    }

    blankAreaCreateInputRef.current?.focus();
    blankAreaCreateInputRef.current?.select();
  }, [blankAreaCreateMode, isBlankAreaCreateOpen]);

  useEffect(() => {
    if (!isBlankAreaCreateOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (blankAreaCreateRef.current && !blankAreaCreateRef.current.contains(event.target as Node)) {
        closeBlankAreaCreate();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeBlankAreaCreate();
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [closeBlankAreaCreate, isBlankAreaCreateOpen]);

  const handleInstantiateTemplate = async (payload: {
    templateId: string;
    title?: string;
    values: Record<string, string>;
  }) => {
    setIsInstantiatingTemplate(true);
    setStatusMessage('Создаем страницу по шаблону');
    setErrorMessage('');

    try {
      const created = await wikiliveApi.instantiateTemplate(payload.templateId, {
        spaceId: selectedSpaceId,
        parentNodeId: templateTargetParentId,
        title: payload.title,
        values: payload.values,
      });
      await refreshTree(selectedSpaceId, created.page.id);
      setActivePageId(created.page.id);
      writeWorkspaceRoute(selectedSpaceId, created.page.id, 'push');
      await refreshTemplates(selectedSpaceId);
      setIsTemplateModalOpen(false);
      setTemplateTargetParentId(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось создать страницу из шаблона');
    } finally {
      setIsInstantiatingTemplate(false);
      setStatusMessage('');
    }
  };

  const handleCreateTemplateFromPage = async (payload: {
    title: string;
    summary: string;
    categoryId: string;
    accessLevel: 'private' | 'space' | 'public';
    document?: Record<string, unknown> | null;
  }) => {
    if (!activeEditor && !editingTemplate) {
      return;
    }

    setIsCreatingTemplate(true);
    setStatusMessage(editingTemplate ? 'Обновляем шаблон' : 'Сохраняем шаблон');
    setErrorMessage('');

    try {
      if (editingTemplate) {
        await wikiliveApi.updateTemplate(editingTemplate.id, {
          title: payload.title,
          summary: payload.summary,
          categoryId: payload.categoryId,
          accessLevel: payload.accessLevel,
          document: payload.document ?? undefined,
        });
      } else {
        await wikiliveApi.createTemplate({
          spaceId: selectedSpaceId,
          title: payload.title,
          summary: payload.summary,
          categoryId: payload.categoryId,
          accessLevel: payload.accessLevel,
          document: payload.document ?? {},
        });
      }

      await refreshTemplates(selectedSpaceId, { page: 1 });
      setIsCreateTemplateModalOpen(false);
      setEditingTemplate(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось сохранить шаблон');
    } finally {
      setIsCreatingTemplate(false);
      setStatusMessage('');
    }
  };

  const handleDeleteTemplate = async (template: PageTemplateSummary) => {
    const confirmed = window.confirm(`Удалить шаблон "${template.title}"?`);

    if (!confirmed) {
      return;
    }

    setIsDeletingTemplate(true);
    setStatusMessage('Удаляем шаблон');

    try {
      await wikiliveApi.deleteTemplate(template.id);
      await refreshTemplates(selectedSpaceId, { page: 1 });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось удалить шаблон');
    } finally {
      setIsDeletingTemplate(false);
      setStatusMessage('');
    }
  };

  const handleEditTemplate = (template: PageTemplateSummary) => {
    if (!template.canManage) {
      return;
    }

    setEditingTemplate(template);
    setIsCreateTemplateModalOpen(true);
  };

  const handleCreateTablePage = async () => {
    if (!selectedTableNode?.mwsNode) {
      return;
    }

    setIsCreatingTablePage(true);
    setStatusMessage('Создаем страницу с MWS таблицей');

    try {
      const response = await wikiliveApi.createMwsTablePage({
        spaceId: selectedSpaceId,
        nodeId: selectedTableNode.mwsNode.id,
        datasheetId: selectedTableNode.datasheetId ?? selectedTableNode.mwsNode.datasheetId ?? selectedTableNode.mwsNode.dstId,
      });
      setSelectedTableNode(null);
      await refreshTree(selectedSpaceId, response.page.id);
      setActivePageId(response.page.id);
      writeWorkspaceRoute(selectedSpaceId, response.page.id, 'push');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось создать страницу с MWS таблицей');
    } finally {
      setIsCreatingTablePage(false);
      setStatusMessage('');
    }
  };

  const handleOpenSelectedMwsTable = () => {
    const url = selectedTableNode?.openInMwsUrl ?? selectedTableNode?.mwsNode?.openInMwsUrl;
    if (!url) {
      setErrorMessage('Для этой таблицы не удалось построить ссылку на tables.mws.ru');
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
    setSelectedTableNode(null);
  };

  const handleDeleteSelectedMwsTable = async () => {
    if (!selectedTableNode?.mwsNode) {
      return;
    }

    const datasheetId = selectedTableNode.datasheetId
      ?? selectedTableNode.mwsNode.datasheetId
      ?? selectedTableNode.mwsNode.dstId
      ?? selectedTableNode.mwsNode.id;
    const confirmed = window.confirm(`Удалить таблицу "${selectedTableNode.title}" из MWS Tables? Это действие нельзя отменить в WikiLive.`);

    if (!confirmed) {
      return;
    }

    setIsDeletingTable(true);
    setStatusMessage('Удаляем MWS таблицу');

    try {
      await wikiliveApi.deleteMwsDatasheet(selectedSpaceId, datasheetId);
      setSelectedTableNode(null);
      await refreshTree(selectedSpaceId, activePageId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось удалить MWS таблицу');
    } finally {
      setIsDeletingTable(false);
      setStatusMessage('');
    }
  };

  const handleDeletePage = async (pageId: string, title: string) => {
    const confirmed = window.confirm(`Удалить страницу "${title}"? Таблицы MWS при этом не удаляются.`);

    if (!confirmed) {
      return;
    }

    setIsDeletingPage(true);
    setStatusMessage('Удаляем страницу');

    try {
      await wikiliveApi.deletePage(pageId);
      const nextActivePageId = await refreshTree(selectedSpaceId, activePageId === pageId ? null : activePageId);

      if (activePageId === pageId) {
        setActivePage(null);
        setBacklinks([]);
        setOutgoingLinks([]);
        writeWorkspaceRoute(selectedSpaceId, nextActivePageId, 'push');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось удалить страницу');
    } finally {
      setIsDeletingPage(false);
      setStatusMessage('');
    }
  };

  const handleExportPage = (pageId: string, title: string, format: ExportFormat) => {
    const doExport = async () => {
      let doc: unknown;

      if (pageId === activePageId && activeEditor) {
        doc = activeEditor.getJSON();
      } else {
        const history = await wikiliveApi.listPageHistory(pageId, 1);
        const checkpointId = history.items[0]?.id;
        if (!checkpointId) {
          throw new Error('Нет сохранённых версий страницы');
        }
        const checkpoint = await wikiliveApi.getPageHistoryCheckpoint(pageId, checkpointId);
        doc = checkpoint.document;
      }

      await exportDocument(title, doc, format);
    };

    void doExport().catch((err) => {
      setErrorMessage(err instanceof Error ? err.message : 'Не удалось экспортировать страницу');
    });
  };

  const handleRenameFolder = async (folderId: string, title: string) => {
    const nextTitle = window.prompt('Новое название папки', title)?.trim();

    if (!nextTitle || nextTitle === title) {
      return;
    }

    setStatusMessage('Переименовываем папку');

    try {
      await wikiliveApi.updateFolder(folderId, { title: nextTitle });
      await refreshTree(selectedSpaceId, activePageId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось переименовать папку');
    } finally {
      setStatusMessage('');
    }
  };

  const handleDeleteFolder = async (folderId: string, title: string) => {
    const confirmed = window.confirm(`Удалить папку "${title}"? Вложенные элементы будут скрыты из дерева.`);

    if (!confirmed) {
      return;
    }

    setStatusMessage('Удаляем папку');

    try {
      await wikiliveApi.deleteFolder(folderId);
      await refreshTree(selectedSpaceId, activePageId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось удалить папку');
    } finally {
      setStatusMessage('');
    }
  };

  const handleRenamePage = async (title: string) => {
    if (!activePageId) {
      return;
    }

    const response = await wikiliveApi.updatePage(activePageId, { title });
    setActivePage(response.page);
    await refreshTree(selectedSpaceId, activePageId);
  };

  const handleToggleHeadingNumbering = async (headingNumberingEnabled: boolean) => {
    if (!activePageId) {
      return;
    }

    const response = await wikiliveApi.updatePage(activePageId, { headingNumberingEnabled });
    setActivePage(response.page);
    await refreshTree(selectedSpaceId, activePageId);
  };

  const handleSaveAccessSettings = async () => {
    if (!activePageId || !accessDraft || !canManageAccess) {
      return;
    }

    setIsUpdatingAccess(true);
    try {
      const response = await wikiliveApi.updatePageAccess(activePageId, accessDraft);
      setActivePage((current) =>
        current
          ? {
              ...current,
              access: response.access,
            }
          : current,
      );
      setAccessDraft(response.access.policy);
      await refreshTree(selectedSpaceId, activePageId);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось обновить настройки доступа');
    } finally {
      setIsUpdatingAccess(false);
    }
  };

  const handleCheckpoint = async () => {
    if (!activePageId) {
      return;
    }

    await Promise.all([refreshActivePage(activePageId), refreshTree(selectedSpaceId, activePageId)]);
  };

  const handleCreateComment = useCallback((editor: Editor) => {
    startThreadFromSelection(editor);
    setRightPanelMode('comments');
  }, [startThreadFromSelection]);

  const handleOpenCommentThread = useCallback((threadId: string) => {
    openThread(threadId);
    setRightPanelMode('comments');
  }, [openThread]);

  const handleCloseComments = useCallback(() => {
    closeCommentsPanel();
    setRightPanelMode('toolbar');
  }, [closeCommentsPanel]);

  const handleOpenTimeMachine = useCallback(() => {
    setRightPanelMode('timeMachine');
  }, []);

  const handleOpenHistoryCheckpoint = useCallback(async (checkpointId: string) => {
    const checkpoint = await history.openCheckpoint(checkpointId);

    if (checkpoint) {
      setHistoryPreviewCheckpoint(checkpoint);
    }
  }, [history]);

  const handleShowCurrentVersion = useCallback(() => {
    setHistoryPreviewCheckpoint(null);
  }, []);

  const handleShowSelectedVersion = useCallback(() => {
    if (history.selectedCheckpoint) {
      setHistoryPreviewCheckpoint(history.selectedCheckpoint);
    }
  }, [history.selectedCheckpoint]);

  const handleDocumentStateEncoderChange = useCallback((encoder: (() => string | null) | null) => {
    setDocumentStateEncoder(() => encoder);
  }, []);

  const handleDocumentStateRestorerChange = useCallback((restorer: ((value: string) => boolean) | null) => {
    setDocumentStateRestorer(() => restorer);
  }, []);

  const handleConfirmLogout = async () => {
    setIsLoggingOut(true);

    try {
      await handleLogout();
    } finally {
      setIsLoggingOut(false);
      setIsLogoutConfirmOpen(false);
    }
  };

  const handleSaveDisplayName = async () => {
    try {
      await handleUpdateDisplayName(displayNameDraft);
      setIsEditingDisplayName(false);
    } catch {
      // Error is already surfaced by auth session state.
    }
  };

  return (
    <main className="flex h-screen overflow-hidden bg-[#f2f5fb] text-editor-text-primary">
      {isWhatsNewBannerVisible ? (
        <div className="pointer-events-none fixed left-1/2 top-4 z-[150] w-full max-w-3xl -translate-x-1/2 px-4">
          <div className="pointer-events-auto overflow-hidden rounded-2xl border border-[#f8d7df] bg-gradient-to-r from-[#fff6f8] via-white to-[#f4f8ff] shadow-[0_16px_40px_rgba(15,23,42,0.14)]">
            <div
              className="h-1 bg-[#d70032] transition-all duration-1000"
              style={{ width: `${Math.max(0, (whatsNewBannerSecondsLeft / WHATS_NEW_BANNER_DURATION_SEC) * 100)}%` }}
            />
            <div className="flex items-start gap-3 px-4 py-3 sm:px-5">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ffe1e7] text-[#d70032]">
                <Sparkles size={16} strokeWidth={2.3} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#1f1f1f]">Обновление редактора</p>
                <p className="mt-0.5 text-xs text-[#4b5563]">
                  Добавили стили для AI-улучшения текста: Обычный, Деловой, Военный, Средневековый, Церковнославянский,
                  Исправить ошибки и Дополнить. Также улучшили ghost-подсказки: стабильнее у курсора, аккуратные пробелы
                  при принятии, скрытие при открытии inline-копилота.
                </p>
                <p className="mt-1 text-xs text-[#4b5563]">
                  Еще добавили Live переменные из таблиц: можно вставлять значение ячейки в текст, открывать подсказку по hover
                  и собирать AI-отчеты по таблице прямо под ней без markdown-таблиц.
                </p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7b8390]">
                  Окно закроется через {whatsNewBannerSecondsLeft} сек
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={disableWhatsNewBanner}
                  className="rounded-lg border border-editor-border-subtle bg-white px-2.5 py-1 text-[11px] font-semibold text-[#556070] transition-colors hover:bg-[#f7f8fa]"
                  title="Больше не показывать"
                >
                  Не показывать
                </button>
                <button
                  type="button"
                  onClick={closeWhatsNewBanner}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[#7b8390] transition-colors hover:bg-[#f2f4f8] hover:text-[#1f2937]"
                  aria-label="Закрыть уведомление"
                  title="Закрыть"
                >
                  <X size={15} strokeWidth={2.2} />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {!leftSidebar.isCollapsed ? (
        <aside
          className="relative z-[90] flex h-full shrink-0 flex-col border-r border-[#e5e6eb] bg-white"
          style={{ width: `${leftSidebar.width}px` }}
        >
          <div className="flex h-16 items-center justify-between px-4">
            <div className="flex min-w-0 items-center gap-3">
              <WorkspaceLogo />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {isEditingDisplayName ? (
                    <input
                      value={displayNameDraft}
                      onChange={(event) => setDisplayNameDraft(event.target.value)}
                      onBlur={() => void handleSaveDisplayName()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void handleSaveDisplayName();
                        }

                        if (event.key === 'Escape') {
                          setDisplayNameDraft(displayName);
                          setIsEditingDisplayName(false);
                        }
                      }}
                      disabled={isUpdatingDisplayName}
                      className="w-full rounded-md border border-editor-border-subtle px-2 py-1 text-[15px] font-semibold text-[#1f1f1f] outline-none focus:border-[#d70032]"
                      autoFocus
                    />
                  ) : (
                    <p className="truncate text-[15px] font-semibold text-[#1f1f1f] ml-[8px]">{displayName}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsEditingDisplayName(true)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#8d8d8d] transition-colors hover:bg-[#f2f3f5] hover:text-[#1f1f1f] "
                    aria-label="Изменить отображаемое имя"
                    title="Изменить отображаемое имя"
                  >
                    <Pencil size={14} strokeWidth={2.2} />
                  </button>
                </div>
                <div ref={spaceSelectMenuRef} className="relative mt-0.5">
                  <button
                    id="workspace-space-select"
                    type="button"
                    onClick={() => setIsSpaceMenuOpen((value) => !value)}
                    className="flex h-7 w-full items-center justify-between gap-2 rounded-md border border-[#ffd9e1] bg-white px-2 text-xs font-semibold text-[#d70032] outline-none transition-colors hover:bg-[#fff1f3] focus-visible:ring-2 focus-visible:ring-[#d70032]/25"
                    style={{
                      minWidth: `${Math.min(longestSpaceNameChars + 4, 20)}ch`,
                      maxWidth: '220px',
                    }}
                    aria-haspopup="menu"
                    aria-expanded={isSpaceMenuOpen}
                    title="Пространство"
                  >
                    <span className="truncate">{spaces.find((space) => space.id === selectedSpaceId)?.name ?? 'Пространство'}</span>
                    <ChevronDown size={13} strokeWidth={2.2} className={isSpaceMenuOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                  </button>
                  {isSpaceMenuOpen ? (
                    <div className="absolute left-0 top-8 z-[120] w-full rounded-lg border border-[#ffd9e1] bg-white p-1 shadow-[0_10px_30px_rgba(215,0,50,0.15)]">
                      <ul className="space-y-1">
                        {spaces.map((space) => {
                          const isSelected = space.id === selectedSpaceId;
                          return (
                            <li key={space.id}>
                              <button
                                type="button"
                                onClick={() => handleSelectSpace(space.id)}
                                className={[
                                  'flex w-full items-center rounded-lg px-2 py-1.5 text-left text-xs font-semibold transition-colors',
                                  isSelected ? 'bg-[#d70032] text-white' : 'bg-white text-[#d70032] hover:bg-[#d70032] hover:text-white',
                                ].join(' ')}
                              >
                                <span className="truncate">{space.name}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                setIsSearchOpen((value) => {
                  if (value) {
                    setSearchQuery('');
                  }

                  return !value;
                })
              }
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-[#696969] transition-colors hover:bg-[#f2f3f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5586ff]/40"
              title="Быстрый поиск"
              data-testid="fast-search-icon"
            >
              <Search size={18} strokeWidth={2.2} />
            </button>
          </div>

          {isSearchOpen ? (
            <div className="px-4 pb-3">
              <div className="relative">
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Найти MWS таблицу, папку или wiki-страницу"
                  className="h-9 w-full rounded-md border border-[#dfe2e7] bg-[#fafafa] px-3 pr-9 text-sm outline-none focus:border-[#d70032]"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setIsSearchOpen(false);
                  }}
                  className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[#7a7f88] transition-colors hover:bg-[#eceff3] hover:text-[#1f2937]"
                  aria-label="Скрыть поиск и сбросить фильтр"
                  title="Скрыть поиск"
                >
                  <X size={14} strokeWidth={2.2} />
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-3 px-3">
            <button
              type="button"
              onClick={() => void handleCreatePage()}
              className="flex h-9 w-[calc(100%-10px)] mr-[10px] items-center justify-center gap-2 rounded-lg bg-[#d70032] px-3 text-sm font-semibold text-white transition-colors hover:bg-[#b8002b]"
            >
              <Plus size={16} strokeWidth={2.4} />
              Создать страницу
            </button>
          </div>

          <div className="mt-2 px-3">
            <button
              type="button"
            onClick={() => openTemplateMarketplace(null)}
              disabled={isTemplatesLoading}
              className="flex h-9 w-[calc(100%-10px)] mr-[10px]  items-center justify-center gap-2 rounded-lg border border-editor-border-subtle bg-white px-3 text-sm font-semibold text-[#1f1f1f] transition-colors hover:bg-[#f7f8fa] disabled:cursor-wait disabled:opacity-60"
            >
              <FileDown size={16} strokeWidth={2.2} />
              {isTemplatesLoading ? 'Загружаем шаблоны...' : 'Маркетплейс шаблонов'}
            </button>
          </div>

          <div
            ref={workbenchTreeWrapperRef}
            className={['relative mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-2',
              dragOverNodeId === null && dragOverPosition === 'inside' ? 'bg-[#fff1f3]/30' : '',
            ].join(' ')}
            id="WORKBENCH_SIDE_NODE_WRAPPER"
            onContextMenu={handleWorkbenchBlankAreaContextMenu}
            onDragOver={(event) => {
              if (!dragSourceId || event.target !== event.currentTarget) {
                return;
              }

              const sourceInfo = findNodeAndParent(tree, dragSourceId);
              if (!sourceInfo || !isWorkspaceMovableNode(sourceInfo.node)) {
                return;
              }

              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setDragOverNodeId?.(null);
              setDragOverPosition?.('inside');
            }}
            onDragEnter={(event) => {
              if (!dragSourceId || event.target !== event.currentTarget) {
                return;
              }

              const sourceInfo = findNodeAndParent(tree, dragSourceId);
              if (!sourceInfo || !isWorkspaceMovableNode(sourceInfo.node)) {
                return;
              }

              event.preventDefault();
              setDragOverNodeId?.(null);
              setDragOverPosition?.('inside');
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node)) {
                return;
              }

              if (dragOverNodeId === null) {
                setDragOverPosition?.(null);
              }
            }}
            onDrop={(event) => {
              if (event.target !== event.currentTarget) {
                return;
              }

              const sourceId = dragSourceId ?? event.dataTransfer.getData('application/x-wikilive-node-id');
              if (!sourceId) {
                return;
              }

              event.preventDefault();
              event.stopPropagation();
              void moveTreeNodeToRoot(sourceId);
            }}
          >
            {dragOverNodeId === null && dragOverPosition === 'inside' ? (
              <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[#fff1f3]/20" />
            ) : null}
            {isLoading ? (
              <WorkspaceTreeSkeleton />
            ) : (
              <>
                {pinnedPages.length === 0 && treeWithoutPinnedPages.length === 0 ? (
                  <p className="px-2 py-2 text-sm text-[#969fa8]">MWS-дерево пустое</p>
                ) : null}
                {hasSearch && pinnedPages.length === 0 && treeWithoutPinnedPages.length === 0 ? (
                  <p className="px-2 py-2 text-sm text-[#969fa8]">Ничего не найдено</p>
                ) : null}
                <ul role="tree" aria-label="Проводник" className="treeViewRoot space-y-0.5" tabIndex={0}>
                  {pinnedPages.map((node) => (
                    <WorkspaceTreeItem
                      key={node.id}
                      node={node}
                      depth={0}
                      activePageId={activePageId}
                      selectedTableNodeId={selectedTableNode?.id ?? null}
                      expandedFolderIds={effectiveExpandedFolderIds}
                      pinnedPageIds={pinnedPageIds}
                      onTogglePinnedPage={handleTogglePinnedPage}
                      onSelectPage={handleSelectPage}
                      onSelectMwsTable={handleSelectMwsTable}
                      onToggleFolder={handleToggleFolder}
                      onDeletePage={(pageId, title) => void handleDeletePage(pageId, title)}
                      onDeleteFolder={(folderId, title) => void handleDeleteFolder(folderId, title)}
                      onRenameFolder={(folderId, title) => void handleRenameFolder(folderId, title)}
                      onCreatePage={async (title, parentNodeId) => {
                        await handleCreatePage(title, parentNodeId);
                      }}
                      onExportPage={handleExportPage}
                      onMoveNode={moveTreeNode}
                      onMoveNodeToRoot={moveTreeNodeToRoot}
                      dragSourceId={dragSourceId}
                      dragOverNodeId={dragOverNodeId}
                      dragOverPosition={dragOverPosition}
                      setDragSourceId={setDragSourceId}
                      setDragOverNodeId={setDragOverNodeId}
                      setDragOverPosition={setDragOverPosition}
                      spaceId={selectedSpaceId}
                      onCreateFolder={async (title, parentNodeId) => {
                        await handleCreateFolder(title, parentNodeId);
                      }}
                      onCreateFromTemplate={(parentNodeId) => {
                        openTemplateMarketplace(parentNodeId);
                      }}
                    />
                  ))}
                  {treeWithoutPinnedPages.map((node) => (
                      <WorkspaceTreeItem
                        key={node.id}
                        node={node}
                        depth={0}
                        activePageId={activePageId}
                        selectedTableNodeId={selectedTableNode?.id ?? null}
                        expandedFolderIds={effectiveExpandedFolderIds}
                        pinnedPageIds={pinnedPageIds}
                        onTogglePinnedPage={handleTogglePinnedPage}
                        onSelectPage={handleSelectPage}
                        onSelectMwsTable={handleSelectMwsTable}
                        onToggleFolder={handleToggleFolder}
                        onDeletePage={(pageId, title) => void handleDeletePage(pageId, title)}
                        onDeleteFolder={(folderId, title) => void handleDeleteFolder(folderId, title)}
                        onRenameFolder={(folderId, title) => void handleRenameFolder(folderId, title)}
                        onCreatePage={async (title, parentNodeId) => {
                          await handleCreatePage(title, parentNodeId);
                        }}
                        onExportPage={handleExportPage}
                        onMoveNode={moveTreeNode}
                        dragSourceId={dragSourceId}
                        dragOverNodeId={dragOverNodeId}
                        dragOverPosition={dragOverPosition}
                        setDragSourceId={setDragSourceId}
                        setDragOverNodeId={setDragOverNodeId}
                        setDragOverPosition={setDragOverPosition}
                        spaceId={selectedSpaceId}
                        onCreateFolder={async (title, parentNodeId) => {
                          await handleCreateFolder(title, parentNodeId);
                        }}
                        onCreateFromTemplate={(parentNodeId) => {
                          openTemplateMarketplace(parentNodeId);
                        }}
                      />
                    ))}
                  </ul>
                  {isBlankAreaCreateOpen && blankAreaCreatePosition ? (
                    <div
                      ref={blankAreaCreateRef}
                      data-workspace-inline-create="true"
                      role="menu"
                      aria-label="Действия в пустой области проводника"
                      className="fixed z-[120] w-[236px] rounded-xl border border-editor-border-subtle bg-white p-2 shadow-[0_16px_40px_rgba(15,23,42,0.12)]"
                      style={{
                        left: blankAreaCreatePosition.left,
                        top: blankAreaCreatePosition.top,
                      }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {blankAreaCreateMode ? (
                        <div className="space-y-2 p-1">
                          <p className="px-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b94a3]">
                            {blankAreaCreateMode === 'folder' ? 'Новая папка' : 'Новая страница'}
                          </p>
                          <input
                            ref={blankAreaCreateInputRef}
                            value={blankAreaCreateTitle}
                            onChange={(event) => {
                              setBlankAreaCreateTitle(event.target.value);
                              if (blankAreaCreateError) {
                                setBlankAreaCreateError('');
                              }
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                void handleBlankAreaCreateSubmit();
                              }

                              if (event.key === 'Escape') {
                                event.preventDefault();
                                setBlankAreaCreateMode(null);
                                setBlankAreaCreateError('');
                              }
                            }}
                            placeholder={
                              blankAreaCreateMode === 'folder'
                                ? 'Введите название папки'
                                : 'Введите название страницы'
                            }
                            disabled={isBlankAreaSubmitting}
                            className="h-10 w-full rounded-lg border border-editor-border-subtle bg-white px-3 text-sm text-[#1f1f1f] outline-none transition-colors focus:border-[#5586ff]"
                          />
                          {blankAreaCreateError ? <p className="px-1 text-xs text-[#d70032]">{blankAreaCreateError}</p> : null}
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setBlankAreaCreateMode(null);
                                setBlankAreaCreateError('');
                              }}
                              className="flex-1 rounded-lg border border-editor-border-subtle px-3 py-2 text-xs font-semibold text-[#4b5563] transition-colors hover:bg-[#f7f8fa]"
                            >
                              Назад
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleBlankAreaCreateSubmit()}
                              disabled={isBlankAreaSubmitting}
                              className="flex-1 rounded-lg bg-[#d70032] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#b8002b] disabled:cursor-wait disabled:opacity-70"
                            >
                              {isBlankAreaSubmitting ? 'Создаем...' : 'Создать'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <BlankAreaMenuItem
                            icon={<Pencil size={15} strokeWidth={2.1} />}
                            label="Новая страница"
                            onClick={() => openBlankAreaCreateMode('page')}
                          />
                          <BlankAreaMenuItem
                            icon={<FolderPlus size={16} strokeWidth={2.1} />}
                            label="Создать папку"
                            onClick={() => openBlankAreaCreateMode('folder')}
                          />
                          <BlankAreaMenuItem
                            icon={<FileDown size={16} strokeWidth={2.2} />}
                            label="Создать из шаблона"
                            onClick={() => openTemplateMarketplace(null)}
                          />
                        </div>
                      )}
                    </div>
                  ) : null}
                </>
              )
            }
          </div>

          <div className="flex h-12 items-center justify-center gap-4 border-t border-[#e5e6eb]">
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-md text-[#30c28b] hover:bg-[#f2f3f5]"
              title="Корзина"
            >
              <Trash2 size={18} strokeWidth={2.1} />
            </button>
            <button
              type="button"
              onClick={() => setIsPluginsModalOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={isPluginsModalOpen}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[#5586ff] hover:bg-[#f2f3f5]"
              title="Плагины"
            >
              <Sparkles size={18} strokeWidth={2.1} />
            </button>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-md text-[#7b67ee] hover:bg-[#f2f3f5]"
              title="Пригласить"
            >
              <Users size={18} strokeWidth={2.1} />
            </button>
            <button
              type="button"
              onClick={() => setIsLogoutConfirmOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[#d70032] transition-colors hover:bg-[#fff1f3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d70032]/20"
              title={displayName ? `Выйти из аккаунта ${displayName}` : 'Выйти из аккаунта'}
              aria-label={displayName ? `Выйти из аккаунта ${displayName}` : 'Выйти из аккаунта'}
            >
              <LogOut size={18} strokeWidth={2.1} />
            </button>
          </div>
          <button
            type="button"
            onClick={leftSidebar.collapse}
            className="absolute -right-4 top-[136px] z-30 flex h-8 w-8 items-center justify-center rounded-full border border-editor-border-subtle bg-white text-editor-text-primary shadow-sm transition-colors hover:bg-editor-bg-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5586ff]/40"
            aria-label="Скрыть левое меню"
            title="Скрыть левое меню"
          >
            <ChevronLeft size={16} strokeWidth={2.2} />
          </button>
          <div
            className="absolute bottom-0 right-0 top-0 z-10 w-1.5 cursor-col-resize bg-transparent transition-colors hover:bg-[#d70032]/10"
            onMouseDown={(event) => {
              event.preventDefault();
              leftSidebar.startResize(event.clientX);
            }}
            aria-hidden="true"
          />
        </aside>
      ) : null}

      <section className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-editor-bg-page">
        {leftSidebar.isCollapsed ? (
          <button
            type="button"
            onClick={leftSidebar.expand}
            className="absolute left-3 top-[136px] z-40 flex h-8 w-8 items-center justify-center rounded-full border border-editor-border-subtle bg-white text-editor-text-primary shadow-sm transition-colors hover:bg-editor-bg-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5586ff]/40"
            aria-label="Показать левое меню"
            title="Показать левое меню"
          >
            <ChevronRight size={16} strokeWidth={2.2} />
          </button>
        ) : null}
        {rightSidebar.isCollapsed && !isScreenNarrow ? (
          <>
            <button
              type="button"
              onClick={() => {
                setRightPanelMode('toolbar');
                rightSidebar.expand();
              }}
              className="absolute right-3 top-[136px] z-40 flex h-8 w-8 items-center justify-center rounded-full border border-editor-border-subtle bg-white text-editor-text-primary shadow-sm transition-colors hover:bg-editor-bg-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5586ff]/40"
              aria-label="Показать правое меню"
              title="Показать правое меню"
            >
              <ChevronLeft size={16} strokeWidth={2.2} />
            </button>
            {isNavigationEnabled ? (
              <button
                type="button"
                onClick={() => {
                  setRightPanelMode((current) => (current === 'navigation' ? 'toolbar' : 'navigation'));
                  rightSidebar.expand();
                }}
                className={[
                  'absolute right-3 top-[176px] z-40 flex h-8 w-8 items-center justify-center rounded-full border shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d70032]/40',
                  rightPanelMode === 'navigation'
                    ? 'border-[#d70032] bg-[#fff1f3] text-[#d70032]'
                    : 'border-editor-border-subtle bg-white text-editor-text-primary hover:bg-editor-bg-control',
                ].join(' ')}
                aria-label={rightPanelMode === 'navigation' ? 'Скрыть навигацию по заголовкам' : 'Показать навигацию по заголовкам'}
                title={rightPanelMode === 'navigation' ? 'Скрыть навигацию по заголовкам' : 'Навигация по заголовкам'}
              >
                <List size={16} strokeWidth={2.2} />
              </button>
            ) : null}
            {isAiSidebarEnabled ? (
              <button
                type="button"
                onClick={() => {
                  setRightPanelMode((current) => (current === 'chat' ? 'toolbar' : 'chat'));
                  rightSidebar.expand();
                }}
                className={[
                  'absolute right-3 top-[216px] z-40 flex h-8 w-8 items-center justify-center rounded-full border shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d70032]/40',
                  rightPanelMode === 'chat'
                    ? 'border-[#d70032] bg-[#fff1f3] text-[#d70032]'
                    : 'border-editor-border-subtle bg-white text-editor-text-primary hover:bg-editor-bg-control',
                ].join(' ')}
                aria-label={rightPanelMode === 'chat' ? 'Скрыть чат ИИ-ассистента' : 'Показать чат ИИ-ассистента'}
                title={rightPanelMode === 'chat' ? 'Скрыть чат ИИ-ассистента' : 'Чат ИИ-ассистента'}
              >
                <MessageSquare size={16} strokeWidth={2.2} />
              </button>
            ) : null}
          </>
        ) : null}
        {errorMessage ? (
          <div className="border-b border-[#ffd2d9] bg-[#fff1f3] px-4 py-2 text-sm text-[#b00025]">{errorMessage}</div>
        ) : null}
        {statusMessage ? (
          <div className="border-b border-editor-border-subtle bg-white px-4 py-2 text-sm text-editor-text-tertiary">{statusMessage}</div>
        ) : null}
        {isCommentsEnabled && comments.errorMessage && !comments.isPanelOpen ? (
          <div className="border-b border-[#efe9ff] bg-[#f7f4ff] px-4 py-2 text-sm text-[#6d5dd3]">{comments.errorMessage}</div>
        ) : null}
        <ScrollArea className="min-h-0 flex-1 overflow-y-auto bg-editor-bg-page">
          <PageEditor
            spaceId={selectedSpaceId}
            page={isPageLoading ? null : activePage}
            isLoading={isPageLoading}
            hideCooperationBadge={!leftSidebar.isCollapsed || !rightSidebar.isCollapsed}
            sidebarInsetClassName={[
              leftSidebar.isCollapsed ? 'pl-12 sm:pl-14' : '',
              rightSidebar.isCollapsed && !isScreenNarrow ? 'pr-12 sm:pr-14' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onRenamePage={handleRenamePage}
            onToggleHeadingNumbering={handleToggleHeadingNumbering}
            onCheckpoint={handleCheckpoint}
            onEditorChange={setActiveEditor}
            onDocumentStateEncoderChange={handleDocumentStateEncoderChange}
            onDocumentStateRestorerChange={handleDocumentStateRestorerChange}
            onCreateComment={isCommentsEnabled && !isHistoryPreviewActive ? handleCreateComment : undefined}
            onOpenCommentThread={isCommentsEnabled && !isHistoryPreviewActive ? handleOpenCommentThread : undefined}
            onOpenTimeMachine={isTimeMachineEnabled && !isHistoryPreviewActive ? handleOpenTimeMachine : undefined}
            commentThreads={editorCommentThreads}
            activeCommentThreadId={comments.activeThreadId}
            commentCount={comments.commentCount}
            historyPreview={historyPreviewCheckpoint}
          />
        </ScrollArea>
      </section>

      {!rightSidebar.isCollapsed ? (
        <aside
          className="relative z-[90] h-full shrink-0 flex flex-col border-l border-editor-border-subtle bg-white/95"
          style={{ width: `${rightSidebar.width}px` }}
        >
          <div
            className="absolute bottom-0 left-0 top-0 z-10 w-1.5 cursor-col-resize bg-transparent transition-colors hover:bg-[#d70032]/10"
            onMouseDown={(event) => {
              event.preventDefault();
              rightSidebar.startResize(event.clientX);
            }}
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={closeRightSidebar}
            className="absolute -left-5 top-[136px] z-30 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-editor-border-subtle bg-white text-editor-text-primary shadow-sm transition-colors hover:bg-editor-bg-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5586ff]/40"
            aria-label="Скрыть правое меню"
            title="Скрыть правое меню"
          >
            <ChevronRight size={16} strokeWidth={2.2} />
          </button>
          {isNavigationEnabled ? (
            <button
              type="button"
              onClick={() => setRightPanelMode((current) => (current === 'navigation' ? 'toolbar' : 'navigation'))}
              className={[
                'absolute -left-5 top-[176px] z-30 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d70032]/40',
                rightPanelMode === 'navigation'
                  ? 'border-[#d70032] bg-[#fff1f3] text-[#d70032]'
                  : 'border-editor-border-subtle bg-white text-editor-text-primary hover:bg-editor-bg-control',
              ].join(' ')}
              aria-label={rightPanelMode === 'navigation' ? 'Скрыть навигацию по заголовкам' : 'Показать навигацию по заголовкам'}
              title={rightPanelMode === 'navigation' ? 'Скрыть навигацию по заголовкам' : 'Навигация по заголовкам'}
            >
              <List size={16} strokeWidth={2.2} />
            </button>
          ) : null}
          {isAiSidebarEnabled ? (
            <button
              type="button"
              onClick={() => setRightPanelMode((current) => (current === 'chat' ? 'toolbar' : 'chat'))}
              className={[
                'absolute -left-5 top-[216px] z-30 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d70032]/40',
                rightPanelMode === 'chat'
                  ? 'border-[#d70032] bg-[#fff1f3] text-[#d70032]'
                  : 'border-editor-border-subtle bg-white text-editor-text-primary hover:bg-editor-bg-control',
              ].join(' ')}
              aria-label={rightPanelMode === 'chat' ? 'Скрыть чат ИИ-ассистента' : 'Показать чат ИИ-ассистента'}
              title={rightPanelMode === 'chat' ? 'Скрыть чат ИИ-ассистента' : 'Чат ИИ-ассистента'}
            >
              <MessageSquare size={16} strokeWidth={2.2} />
            </button>
          ) : null}

          {isCommentsEnabled && rightPanelMode === 'comments' ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <CommentsPanel
              activeThread={comments.activeThread}
              activeThreadId={comments.activeThreadId}
              isLoading={comments.isLoading}
              errorMessage={comments.errorMessage}
              canComment={activePage?.access?.capabilities.canComment ?? true}
              onRetry={() => void comments.refreshComments()}
              onClose={handleCloseComments}
              onSubmitMessage={comments.submitMessage}
                onEditMessage={comments.editMessage}
                onDeleteMessage={comments.deleteMessage}
                onResolveThread={comments.resolveThread}
              />
            </div>
          ) : isTimeMachineEnabled && rightPanelMode === 'timeMachine' ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <TimeMachinePanel
                items={history.items}
                selectedCheckpoint={history.selectedCheckpoint}
                selectedCheckpointId={history.selectedCheckpointId}
                isPreviewActive={isHistoryPreviewActive}
                isLoading={history.isLoading}
                isLoadingCheckpoint={history.isLoadingCheckpoint}
                isRestoring={history.isRestoring}
                errorMessage={history.errorMessage}
                onOpenCheckpoint={handleOpenHistoryCheckpoint}
                onShowCurrentVersion={handleShowCurrentVersion}
                onShowSelectedVersion={handleShowSelectedVersion}
                onRestoreCheckpoint={history.restoreCheckpoint}
                canRestore={canEditActivePage}
                restoreDisabledReason="У вас недостаточно прав для восстановления версии"
                onRetry={() => void history.refreshHistory()}
                onClose={() => setRightPanelMode('toolbar')}
              />
            </div>
          ) : isNavigationEnabled && rightPanelMode === 'navigation' ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <NavigationSidebar
                editor={activeEditor}
                enabled={isNavigationEnabled}
                onClose={() => setRightPanelMode('toolbar')}
              />
            </div>
          ) : isAiSidebarEnabled && rightPanelMode === 'chat' ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <AiSidebarChat
                pageId={activePageId}
                pageTitle={activePage?.title}
                editor={activeEditor}
                enabled={isAiSidebarEnabled}
                availablePages={flattenWorkspacePages(tree)}
                onClose={() => setRightPanelMode('toolbar')}
              />
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <section className="border-b border-editor-border-subtle pb-4">
                  <div className="mb-4 flex rounded-md bg-[#f1f2f4] p-0.5">
                    {isCommentsEnabled ? (
                      <button
                        type="button"
                        onClick={() => {
                          setRightPanelMode('comments');
                          void comments.refreshComments();
                        }}
                        className="flex h-8 flex-1 items-center justify-center gap-1 rounded-[5px] text-xs font-semibold text-[#505762] hover:bg-white"
                      >
                        <MessageSquare size={14} />
                        Комментарии{comments.commentCount > 0 ? ` ${comments.commentCount}` : ''}
                      </button>
                    ) : null}
                    {isTimeMachineEnabled ? (
                      <button
                        type="button"
                        onClick={handleOpenTimeMachine}
                        className="flex h-8 flex-1 items-center justify-center gap-1 rounded-[5px] text-xs font-semibold text-[#505762] hover:bg-white"
                      >
                        <History size={14} />
                        Машина времени
                      </button>
                    ) : null}
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-editor-text-tertiary">Связи</p>
                  <h2 className="mt-1 font-wide text-base font-semibold">{activePage?.title ?? 'Страница не выбрана'}</h2>
                  <button
                    type="button"
                    onClick={() => void handleCopyShareLink()}
                    disabled={!activePageId}
                    className="mt-3 w-full rounded-lg border border-editor-border-subtle bg-white px-3 py-2 text-sm font-semibold text-editor-text-secondary transition-colors hover:bg-editor-bg-control disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {shareStatus || 'Скопировать ссылку'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTemplate(null);
                      setIsCreateTemplateModalOpen(true);
                    }}
                    disabled={!activeEditor || !canEditActivePage}
                    className="mt-2 w-full rounded-lg border border-editor-border-subtle bg-white px-3 py-2 text-sm font-semibold text-editor-text-secondary transition-colors hover:bg-editor-bg-control disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="inline-flex items-center gap-2">
                      <FileUp size={15} strokeWidth={2.2} />
                      Сохранить как шаблон
                    </span>
                  </button>
                  {activePageId && (activePage?.access?.capabilities.canDelete ?? true) ? (
                    <button
                      type="button"
                      onClick={() => void handleDeletePage(activePageId, activePage?.title ?? 'Без названия')}
                      disabled={isDeletingPage}
                      className="mt-2 w-full rounded-lg border border-[#ffd2d9] bg-[#fff7f8] px-3 py-2 text-sm font-semibold text-[#b00025] transition-colors hover:border-[#d70032] hover:bg-[#fff1f3] disabled:cursor-wait disabled:opacity-60"
                    >
                      {isDeletingPage ? 'Удаляем страницу...' : 'Удалить страницу'}
                    </button>
                  ) : null}
                  {canManageAccess && accessDraft ? (
                    <div className="mt-3 rounded-2xl border border-[#d7e2f2] bg-[#f7fafe] p-3">
                      <button
                        type="button"
                        onClick={() => setIsAccessPanelOpen((current) => !current)}
                        className="flex w-full items-center justify-between gap-3 text-left"
                        aria-expanded={isAccessPanelOpen}
                        aria-controls="workspace-access-settings"
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#556987]">Доступ</p>
                        {isAccessPanelOpen ? <ChevronDown size={15} strokeWidth={2.3} /> : <ChevronRight size={15} strokeWidth={2.3} />}
                      </button>
                      {isAccessPanelOpen ? (
                        <div id="workspace-access-settings" className="mt-3 space-y-3">
                          <label className="block text-xs text-[#5f7189]">
                            <span className="mb-1 block font-semibold">Кто может просматривать</span>
                            <select
                              value={accessDraft.viewAccess}
                              onChange={(event) =>
                                setAccessDraft((current) =>
                                  current
                                    ? {
                                        ...current,
                                        viewAccess: event.target.value as DocumentAccessPolicy['viewAccess'],
                                      }
                                    : current
                                )
                              }
                              className="w-full rounded-lg border border-[#d4deec] bg-white px-3 py-2 text-sm text-editor-text-primary outline-none"
                            >
                              {ACCESS_SCOPE_OPTIONS.map((option) => (
                                <option key={`view-${option.value}`} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block text-xs text-[#5f7189]">
                            <span className="mb-1 block font-semibold">Кто может комментировать</span>
                            <select
                              value={accessDraft.commentAccess}
                              onChange={(event) =>
                                setAccessDraft((current) =>
                                  current
                                    ? {
                                        ...current,
                                        commentAccess: event.target.value as DocumentAccessPolicy['commentAccess'],
                                      }
                                    : current
                                )
                              }
                              className="w-full rounded-lg border border-[#d4deec] bg-white px-3 py-2 text-sm text-editor-text-primary outline-none"
                            >
                              {ACCESS_SCOPE_OPTIONS.map((option) => (
                                <option key={`comment-${option.value}`} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block text-xs text-[#5f7189]">
                            <span className="mb-1 block font-semibold">Кто может редактировать</span>
                            <select
                              value={accessDraft.editAccess}
                              onChange={(event) =>
                                setAccessDraft((current) =>
                                  current
                                    ? {
                                        ...current,
                                        editAccess: event.target.value as DocumentAccessPolicy['editAccess'],
                                      }
                                    : current
                                )
                              }
                              className="w-full rounded-lg border border-[#d4deec] bg-white px-3 py-2 text-sm text-editor-text-primary outline-none"
                            >
                              {ACCESS_SCOPE_OPTIONS.map((option) => (
                                <option key={`edit-${option.value}`} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            onClick={() => void handleSaveAccessSettings()}
                            disabled={!hasAccessChanges || isUpdatingAccess}
                            className="w-full rounded-lg bg-[#d70032] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#b8002b] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isUpdatingAccess ? 'Сохраняем доступ...' : 'Сохранить доступ'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <WorkspaceAccessSummary access={activePage?.access} />
                  )}
                </section>

                <div className="mt-5 space-y-5">
            <section>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Граф страниц</h3>
                {!isDocumentGraphEnabled ? (
                  <button
                    type="button"
                    onClick={() => setIsPluginsModalOpen(true)}
                    className="rounded-full border border-editor-border-subtle bg-editor-bg-control px-2.5 py-1 text-[11px] font-semibold text-editor-text-secondary transition-colors hover:bg-[#e7eaef]"
                  >
                    Подключить
                  </button>
                ) : null}
              </div>
              <div className="mt-2">
                {isDocumentGraphEnabled ? (
                  <DocumentLinkGraph
                    pages={flattenWorkspacePages(tree)}
                    activePageId={activePageId}
                    edges={graphEdges}
                    onSelectPage={handleSelectPage}
                    onRefreshGraph={refreshDocumentGraph}
                  />
                ) : (
                  <div className="rounded-2xl border border-dashed border-editor-border-subtle bg-[#fafbfc] px-4 py-5 text-sm text-editor-text-tertiary">
                    Плагин `Document Graph` сейчас отключен или недоступен по плану.
                  </div>
                )}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold">Backlinks ({backlinks.length})</h3>
              <div className="mt-2 space-y-2">
                {backlinks.length === 0 ? <p className="text-sm text-editor-text-tertiary">Обратных ссылок пока нет</p> : null}
                {backlinks.map((link) => (
                  <button
                    key={link.pageId}
                    type="button"
                    onClick={() => handleSelectPage(link.pageId)}
                    className="block w-full rounded-lg border border-editor-border-subtle p-3 text-left text-sm hover:bg-editor-bg-control"
                  >
                    <span className="font-semibold">{link.title}</span>
                    {link.excerpt ? (
                      <span className="mt-1 block truncate text-xs text-editor-text-tertiary">{link.excerpt}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold">Исходящие ({outgoingLinks.length})</h3>
              <div className="mt-2 space-y-2">
                {outgoingLinks.length === 0 ? <p className="text-sm text-editor-text-tertiary">Ссылок из страницы пока нет</p> : null}
                {outgoingLinks.map((link) => (
                  <button
                    key={link.targetPageId}
                    type="button"
                    onClick={() => handleSelectPage(link.targetPageId)}
                    className="block w-full rounded-lg border border-editor-border-subtle p-3 text-left text-sm hover:bg-editor-bg-control"
                  >
                    <span className="font-semibold">{link.targetTitle}</span>
                    <span className="mt-1 block text-xs text-editor-text-tertiary">Упоминаний: {link.mentionCount}</span>
                  </button>
                ))}
              </div>
            </section>
                </div>
              </div>
            </>
          )}
        </aside>
      ) : null}

      <PluginsModal
        isOpen={isPluginsModalOpen}
        items={plugins}
        plan={plan}
        isLoading={isPluginsLoading}
        errorMessage={pluginsErrorMessage}
        pendingPluginId={pendingPluginId}
        aiAssistantFeatures={aiAssistantFeatures}
        onClose={() => setIsPluginsModalOpen(false)}
        onTogglePlugin={(pluginId, enabled) => void togglePlugin(pluginId, enabled)}
        onToggleSettings={(pluginId, settings) => void updatePluginSettings(pluginId, settings)}
        onToggleAiAssistantFeature={toggleAiAssistantFeature}
      />
      <MwsTableActionModal
        node={selectedTableNode}
        isCreating={isCreatingTablePage}
        isDeleting={isDeletingTable}
        onCreatePage={() => void handleCreateTablePage()}
        onOpenMws={handleOpenSelectedMwsTable}
        onDelete={() => void handleDeleteSelectedMwsTable()}
        onClose={() => setSelectedTableNode(null)}
      />
      {isLogoutConfirmOpen ? (
        <LogoutConfirmModal
          displayName={displayName}
          isSubmitting={isLoggingOut}
          onConfirm={() => void handleConfirmLogout()}
          onClose={() => {
            if (!isLoggingOut) {
              setIsLogoutConfirmOpen(false);
            }
          }}
        />
      ) : null}
      <PageTemplateMarketplaceModal
        isOpen={isTemplateModalOpen}
        templates={templates}
        query={templateQuery}
        pageInfo={templatePageInfo}
        categories={templateCategories}
        isListLoading={isTemplatesLoading}
        isSubmitting={isInstantiatingTemplate}
        isDeleting={isDeletingTemplate}
        onClose={() => {
          if (!isInstantiatingTemplate) {
            setIsTemplateModalOpen(false);
            setTemplateTargetParentId(null);
          }
        }}
        onQueryChange={(queryOverrides) => void refreshTemplates(selectedSpaceId, { ...queryOverrides, page: 1 })}
        onNextPage={() => void refreshTemplates(selectedSpaceId, { page: (templatePageInfo.page ?? 1) + 1 })}
        onPrevPage={() => void refreshTemplates(selectedSpaceId, { page: Math.max(1, (templatePageInfo.page ?? 1) - 1) })}
        onSubmit={handleInstantiateTemplate}
        onEditTemplate={handleEditTemplate}
        onDeleteTemplate={handleDeleteTemplate}
      />
      <CreateTemplateFromPageModal
        isOpen={isCreateTemplateModalOpen}
        mode={editingTemplate ? 'edit' : 'create'}
        sourcePageTitle={editingTemplate?.title ?? pendingTemplateSource?.title ?? activePage?.title ?? 'Новая страница'}
        categories={templateCategories}
        initialSummary={editingTemplate?.summary}
        initialCategoryId={editingTemplate?.categoryId ?? templateCategories[0]?.id ?? null}
        initialAccessLevel={editingTemplate?.accessLevel}
        isSubmitting={isCreatingTemplate}
        document={editingTemplate ? null : (activeEditor?.getJSON() as Record<string, unknown> | null)}
        onClose={() => {
          setIsCreateTemplateModalOpen(false);
          setPendingTemplateSource(null);
          setEditingTemplate(null);
        }}
        onSubmit={handleCreateTemplateFromPage}
      />
    </main>
  );
}
