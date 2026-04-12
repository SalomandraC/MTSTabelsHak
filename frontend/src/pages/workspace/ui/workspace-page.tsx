import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  FileDown,
  FileUp,
  History,
  LogOut,
  MoreHorizontal,
  MessageSquare,
  Pencil,
  Plus,
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
import { AiChatSidebar } from '../../../features/plugins/ai-assistant';
import { PluginsModal, usePlugins } from '../../../features/plugins';
import { ScrollArea } from '../../../shared/ui';
import {
  DEFAULT_WIKILIVE_SPACE_ID,
  type Backlink,
  type DocumentAccessPolicy,
  type MwsSpace,
  type OutgoingLink,
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
import { shouldShowWorkspacePageActions } from './workspace-node-permissions';
import { getWorkspaceNodeIcon } from './workspace-node-icon';
import { readWorkspaceRoute, resolveAccessibleSpaceId, writeWorkspaceRoute } from '../../../shared/lib/workspace-route';
import {
  LEFT_SIDEBAR_MAX_WIDTH,
  LEFT_SIDEBAR_MIN_WIDTH,
  RIGHT_SIDEBAR_MAX_WIDTH,
  RIGHT_SIDEBAR_MIN_WIDTH,
  useResizableSidebar,
} from './workspace-layout';

const SELECTED_SPACE_STORAGE_KEY = 'wikilive:selected-space-id';
const DEFAULT_TEMPLATE_PAGE_SIZE = 20;

function getShareUrl(spaceId: string, pageId: string | null) {
  const url = new URL(window.location.href);
  url.pathname = pageId
    ? `/spaces/${encodeURIComponent(spaceId)}/pages/${encodeURIComponent(pageId)}`
    : `/spaces/${encodeURIComponent(spaceId)}`;
  url.searchParams.delete('spaceId');
  url.searchParams.delete('pageId');

  return url.toString();
}

function flattenWorkspacePages(nodes: WorkspaceTreeNode[]): DocumentGraphPage[] {
  return nodes.flatMap((node) => [
    ...(node.kind === 'wikiPage' && node.linkedPageId ? [{ id: node.linkedPageId, title: node.title }] : []),
    ...flattenWorkspacePages(node.children ?? []),
  ]);
}

function collectWorkspaceFolderIds(nodes: WorkspaceTreeNode[]): string[] {
  return nodes.flatMap((node) => [
    ...(node.kind === 'mwsFolder' || node.children.length > 0 ? [node.id] : []),
    ...collectWorkspaceFolderIds(node.children ?? []),
  ]);
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

function WorkspaceLogo() {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[#f8c58b] text-[#9a5a1e] shadow-sm">
      <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true" className="drop-shadow-sm">
        <path
          d="M20 42h24v10.2c0 .8-.5 1.5-1.2 1.8l-10 4.6a2 2 0 0 1-1.6 0l-10-4.6A2 2 0 0 1 20 52.2V42Z"
          fill="#d89548"
        />
        <circle cx="32" cy="25" r="22" fill="#f8c58b" />
        <circle cx="32" cy="25" r="18.75" fill="none" stroke="#df9b50" strokeWidth="1.5" />
        <path
          d="M31.4 37.9c.2.5.9.5 1.2 0l11-21.9a.7.7 0 0 0-.6-1h-6.7c-.2 0-.5.1-.6.3l-3.1 6c-.2.5-.9.5-1.1 0l-2.8-5.9a.7.7 0 0 0-.6-.4H21c-.5 0-.8.5-.6.9l11 22Z"
          fill="#e09847"
        />
      </svg>
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

type RightPanelMode = 'links' | 'comments' | 'timeMachine';

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
  onSelectPage,
  onSelectMwsTable,
  onToggleFolder,
  onDeletePage,
  onCreatePage,
}: {
  node: WorkspaceTreeNode;
  depth: number;
  activePageId: string | null;
  selectedTableNodeId: string | null;
  expandedFolderIds: Set<string>;
  onSelectPage: (pageId: string) => void;
  onSelectMwsTable: (node: WorkspaceTreeNode) => void;
  onToggleFolder: (folderId: string) => void;
  onDeletePage: (pageId: string, title: string) => void;
  onCreatePage: (title: string, parentNodeId?: string | null) => Promise<void>;
}) {
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [isCreatingPage, setIsCreatingPage] = useState(false);
  const [createPageTitle, setCreatePageTitle] = useState('');
  const [createError, setCreateError] = useState('');
  const [contextMenuPosition, setContextMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const hasChildren = node.children.length > 0;
  const isExpandable = node.kind === 'mwsFolder' || hasChildren;
  const isExpanded = isExpandable ? expandedFolderIds.has(node.id) : false;
  const isActivePage = node.linkedPageId === activePageId;
  const isSelectedTable = node.kind === 'mwsTable' && node.id === selectedTableNodeId;
  const canDeletePage = node.wikiPage?.role === 'owner';
  const canOpenActionsMenu = shouldShowWorkspacePageActions(node);
  const itemPadding = 8 + depth * 22;

  const closeActionsMenu = useCallback(() => {
    setIsActionsMenuOpen(false);
    setIsCreateMode(false);
    setIsCreatingPage(false);
    setCreatePageTitle('');
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

    window.addEventListener('mousedown', handlePointerDown);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, [closeActionsMenu, isActionsMenuOpen]);

  useEffect(() => {
    if (!isCreateMode) {
      return;
    }

    createInputRef.current?.focus();
  }, [isCreateMode]);

  const openCreateMode = () => {
    setCreateError('');
    setCreatePageTitle('');
    setIsCreateMode(true);
  };

  const handleCreatePageSubmit = async () => {
    const normalizedTitle = createPageTitle.trim();

    if (!normalizedTitle) {
      setCreateError('Введите название страницы');
      return;
    }

    setCreateError('');
    setIsCreatingPage(true);

    try {
      await onCreatePage(normalizedTitle, node.parentId ?? null);
      closeActionsMenu();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Не удалось создать страницу');
      setIsCreatingPage(false);
    }
  };

  const openActionsMenuAtCursor = (event: React.MouseEvent) => {
    const menuWidth = 176;
    const menuHeight = 224;
    const left = Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8));
    const top = Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8));

    setIsCreateMode(false);
    setCreateError('');
    setCreatePageTitle('');
    setContextMenuPosition({ left, top });
    setIsActionsMenuOpen(true);
  };

  return (
    <li className="treeItemRoot relative" tabIndex={-1}>
      <div
        className={[
          'group flex h-8 items-center rounded-md pr-1 text-sm transition-colors',
          node.kind === 'wikiPage' ? 'text-[#303030] hover:bg-[#f2f3f5]' : 'text-[#4d4d4d] hover:bg-[#f2f3f5]',
          isActivePage ? 'bg-[#fff1f3] font-semibold text-[#d70032]' : '',
          isSelectedTable ? 'bg-[#f2f3f5] font-semibold text-[#1f1f1f]' : '',
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
              : undefined
          }
        >
          <span
            className={[
              node.kind === 'mwsFolder' ? 'text-[#df9b50]' : '',
              node.kind === 'mwsTable' ? 'text-[#d70032]' : '',
              node.kind === 'mwsNode' ? 'text-[#8d8d8d]' : '',
              node.kind === 'wikiPage' ? 'text-[#7a7f88]' : '',
            ].join(' ')}
          >
            {getWorkspaceNodeIcon(node)}
          </span>
          <span className="truncate">{node.title}</span>
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

                setIsCreateMode(false);
                setCreateError('');
                setCreatePageTitle('');
                setContextMenuPosition(null);
                setIsActionsMenuOpen(true);
              }}
              className="flex h-6 w-6 items-center justify-center rounded text-[#b6b6b6] opacity-0 transition-opacity hover:bg-[#f2f3f5] hover:text-[#1f1f1f] group-hover:opacity-100"
              title="Действия"
              aria-label={`Действия для страницы ${node.title}`}
              aria-haspopup="menu"
              aria-expanded={isActionsMenuOpen}
            >
              <MoreHorizontal size={14} strokeWidth={2.2} />
            </button>

            <WorkspacePageActionsMenu
              title={node.title}
              linkedPageId={node.linkedPageId ?? ''}
              canDeletePage={Boolean(canDeletePage)}
              isOpen={isActionsMenuOpen}
              isCreateMode={isCreateMode}
              isCreatingPage={isCreatingPage}
              createPageTitle={createPageTitle}
              createError={createError}
              contextMenuPosition={contextMenuPosition}
              createInputRef={createInputRef}
              onCloseActionsMenu={closeActionsMenu}
              onOpenCreateMode={openCreateMode}
              onCreatePageTitleChange={setCreatePageTitle}
              onCreatePageSubmit={() => void handleCreatePageSubmit()}
              onCancelCreateMode={() => {
                setIsCreateMode(false);
                setCreateError('');
              }}
              onSelectPage={onSelectPage}
              onDeletePage={() => onDeletePage(node.linkedPageId!, node.title)}
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
              onSelectPage={onSelectPage}
              onSelectMwsTable={onSelectMwsTable}
              onToggleFolder={onToggleFolder}
              onDeletePage={onDeletePage}
              onCreatePage={onCreatePage}
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
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
  );
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
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
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [workbenchTab, setWorkbenchTab] = useState<'catalog' | 'favorite'>('catalog');
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [selectedTableNode, setSelectedTableNode] = useState<WorkspaceTreeNode | null>(null);
  const [activePage, setActivePage] = useState<WikiPage | null>(null);
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [outgoingLinks, setOutgoingLinks] = useState<OutgoingLink[]>([]);
  const [graphEdges, setGraphEdges] = useState<DocumentGraphEdge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreatingTablePage, setIsCreatingTablePage] = useState(false);
  const [isDeletingTable, setIsDeletingTable] = useState(false);
  const [isDeletingPage, setIsDeletingPage] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Загружаем wiki workspace');
  const [errorMessage, setErrorMessage] = useState('');
  const [shareStatus, setShareStatus] = useState('');
  const [isPluginsModalOpen, setIsPluginsModalOpen] = useState(false);
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const [documentStateEncoder, setDocumentStateEncoder] = useState<(() => string | null) | null>(null);
  const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>('links');
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isEditingDisplayName, setIsEditingDisplayName] = useState(false);
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
  const hasSearch = searchQuery.trim().length > 0;
  const canManageAccess = activePage?.access?.capabilities.canManageAccess ?? false;
  const canEditActivePage = activePage?.access?.capabilities.canEdit ?? true;
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
  const isTimeMachineEnabled = isPluginEnabled('time-machine');
  const isAiSidebarEnabled = isWorkspaceSidebarEnabled('sidebar');
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

  const history = usePageHistory({
    pageId: activePageId,
    editor: activeEditor,
    enabled: isTimeMachineEnabled && Boolean(activePage) && rightPanelMode === 'timeMachine',
    getDocumentStateValue: documentStateEncoder,
    onRestored: async () => {
      if (activePageId) {
        await Promise.all([refreshActivePage(activePageId), refreshTree(selectedSpaceId, activePageId)]);
      }
    },
  });

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
      },
    });

    return () => {
      channel.close();
    };
  }, [applyPageAccessUpdate, selectedSpaceId]);

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
      setRightPanelMode('links');
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
    setSelectedTableNode(null);
    setActivePage(null);
    setActivePageId(pageId);
    writeWorkspaceRoute(selectedSpaceId, pageId, 'push');
  };

  const handleSelectSpace = (spaceId: string) => {
    pendingRoutePageIdRef.current = null;
    setSelectedSpaceId(spaceId);
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
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось создать страницу');
    } finally {
      setStatusMessage('');
    }
  };

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
        title: payload.title,
        values: payload.values,
      });
      await refreshTree(selectedSpaceId, created.page.id);
      setActivePageId(created.page.id);
      writeWorkspaceRoute(selectedSpaceId, created.page.id, 'push');
      await refreshTemplates(selectedSpaceId);
      setIsTemplateModalOpen(false);
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

  const handleRenamePage = async (title: string) => {
    if (!activePageId) {
      return;
    }

    const response = await wikiliveApi.updatePage(activePageId, { title });
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
    setRightPanelMode('links');
  }, [closeCommentsPanel]);

  const handleOpenTimeMachine = useCallback(() => {
    setRightPanelMode('timeMachine');
  }, []);

  const handleDocumentStateEncoderChange = useCallback((encoder: (() => string | null) | null) => {
    setDocumentStateEncoder(() => encoder);
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
      {!leftSidebar.isCollapsed ? (
        <aside
          className="relative flex h-full shrink-0 flex-col border-r border-[#e5e6eb] bg-white"
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
                    <p className="truncate text-[15px] font-semibold text-[#1f1f1f]">{displayName}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsEditingDisplayName(true)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#8d8d8d] transition-colors hover:bg-[#f2f3f5] hover:text-[#1f1f1f]"
                    aria-label="Изменить отображаемое имя"
                    title="Изменить отображаемое имя"
                  >
                    <Pencil size={14} strokeWidth={2.2} />
                  </button>
                </div>
                <label className="sr-only" htmlFor="workspace-space-select">
                  Пространство
                </label>
                <select
                  id="workspace-space-select"
                  value={selectedSpaceId}
                  onChange={(event) => handleSelectSpace(event.target.value)}
                  className="mt-0.5 h-6 max-w-[170px] rounded border-0 bg-transparent px-0 text-xs font-semibold text-[#767676] outline-none hover:text-[#333]"
                  title="Пространство"
                >
                  {spaces.map((space) => (
                    <option key={space.id} value={space.id}>
                      {space.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsSearchOpen((value) => !value)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#696969] transition-colors hover:bg-[#f2f3f5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5586ff]/40"
              title="Быстрый поиск"
              data-testid="fast-search-icon"
            >
              <Search size={18} strokeWidth={2.2} />
            </button>
          </div>

          {isSearchOpen ? (
            <div className="px-4 pb-3">
              <input
                autoFocus
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Найти MWS таблицу, папку или wiki-страницу"
                className="h-9 w-full rounded-md border border-[#dfe2e7] bg-[#fafafa] px-3 text-sm outline-none focus:border-[#5586ff]"
              />
            </div>
          ) : null}

          <div className="px-3">
            <div className="flex rounded-md bg-[#f1f2f4] p-0.5">
              <button
                type="button"
                onClick={() => setWorkbenchTab('catalog')}
                className={[
                  'h-8 flex-1 rounded-[5px] text-sm font-semibold transition-colors',
                  workbenchTab === 'catalog' ? 'bg-white text-[#1f1f1f] shadow-sm' : 'text-[#777] hover:text-[#333]',
                ].join(' ')}
              >
                Проводник
              </button>
              <button
                type="button"
                onClick={() => setWorkbenchTab('favorite')}
                className={[
                  'h-8 flex-1 rounded-[5px] text-sm font-semibold transition-colors',
                  workbenchTab === 'favorite' ? 'bg-white text-[#1f1f1f] shadow-sm' : 'text-[#777] hover:text-[#333]',
                ].join(' ')}
              >
                Закрепить
              </button>
            </div>
          </div>

          <div className="mt-3 px-3">
            <button
              type="button"
              onClick={() => void handleCreatePage()}
              className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[#d70032] px-3 text-sm font-semibold text-white transition-colors hover:bg-[#b8002b]"
            >
              <Plus size={16} strokeWidth={2.4} />
              Создать страницу
            </button>
          </div>

          <div className="mt-2 px-3">
            <button
              type="button"
              onClick={() => {
                setIsTemplateModalOpen(true);
                void ensureTemplateCategoriesLoaded().catch((error) => {
                  setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить категории шаблонов');
                });
                void refreshTemplates(selectedSpaceId, { page: 1 });
              }}
              disabled={isTemplatesLoading}
              className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-editor-border-subtle bg-white px-3 text-sm font-semibold text-[#1f1f1f] transition-colors hover:bg-[#f7f8fa] disabled:cursor-wait disabled:opacity-60"
            >
              <FileDown size={16} strokeWidth={2.2} />
              {isTemplatesLoading ? 'Загружаем шаблоны...' : 'Маркетплейс шаблонов'}
            </button>
          </div>

          <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-2" id="WORKBENCH_SIDE_NODE_WRAPPER">
            {workbenchTab === 'favorite' ? (
              <div className="px-3 py-6 text-sm text-[#969fa8]">Закрепленных страниц пока нет</div>
            ) : (
              isLoading ? (
                <WorkspaceTreeSkeleton />
              ) : (
                <>
                  {tree.length === 0 ? <p className="px-2 py-2 text-sm text-[#969fa8]">MWS-дерево пустое</p> : null}
                  {hasSearch && visibleTree.length === 0 ? (
                    <p className="px-2 py-2 text-sm text-[#969fa8]">Ничего не найдено</p>
                  ) : null}
                  <ul role="tree" aria-label="Проводник" className="treeViewRoot space-y-0.5" tabIndex={0}>
                    {visibleTree.map((node) => (
                      <WorkspaceTreeItem
                        key={node.id}
                        node={node}
                        depth={0}
                        activePageId={activePageId}
                        selectedTableNodeId={selectedTableNode?.id ?? null}
                        expandedFolderIds={effectiveExpandedFolderIds}
                        onSelectPage={handleSelectPage}
                        onSelectMwsTable={handleSelectMwsTable}
                        onToggleFolder={handleToggleFolder}
                        onDeletePage={(pageId, title) => void handleDeletePage(pageId, title)}
                        onCreatePage={(title, parentNodeId) => handleCreatePage(title, parentNodeId)}
                      />
                    ))}
                  </ul>
                </>
              )
            )}
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
            className="absolute -right-4 top-24 z-30 flex h-8 w-8 items-center justify-center rounded-full border border-editor-border-subtle bg-white text-editor-text-primary shadow-sm transition-colors hover:bg-editor-bg-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5586ff]/40"
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
        {rightSidebar.isCollapsed ? (
          <button
            type="button"
            onClick={rightSidebar.expand}
            className="absolute right-3 top-[136px] z-40 flex h-8 w-8 items-center justify-center rounded-full border border-editor-border-subtle bg-white text-editor-text-primary shadow-sm transition-colors hover:bg-editor-bg-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5586ff]/40"
            aria-label="Показать правое меню"
            title="Показать правое меню"
          >
            <ChevronLeft size={16} strokeWidth={2.2} />
          </button>
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
            onRenamePage={handleRenamePage}
            onCheckpoint={handleCheckpoint}
            onEditorChange={setActiveEditor}
            onDocumentStateEncoderChange={handleDocumentStateEncoderChange}
            onCreateComment={isCommentsEnabled ? handleCreateComment : undefined}
            onOpenCommentThread={isCommentsEnabled ? handleOpenCommentThread : undefined}
            onOpenTimeMachine={isTimeMachineEnabled ? handleOpenTimeMachine : undefined}
            commentThreads={editorCommentThreads}
            activeCommentThreadId={comments.activeThreadId}
            commentCount={comments.commentCount}
          />
        </ScrollArea>
      </section>

      {!rightSidebar.isCollapsed ? (
        <aside
          className="relative h-full shrink-0 flex flex-col border-l border-editor-border-subtle bg-white/95"
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
            onClick={rightSidebar.collapse}
            className="absolute -left-4 top-24 z-30 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-editor-border-subtle bg-white text-editor-text-primary shadow-sm transition-colors hover:bg-editor-bg-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5586ff]/40"
            aria-label="Скрыть правое меню"
            title="Скрыть правое меню"
          >
            <ChevronRight size={16} strokeWidth={2.2} />
          </button>

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
                isLoading={history.isLoading}
                isLoadingCheckpoint={history.isLoadingCheckpoint}
                isRestoring={history.isRestoring}
                errorMessage={history.errorMessage}
                onOpenCheckpoint={(checkpointId) => void history.openCheckpoint(checkpointId)}
                onRestoreCheckpoint={history.restoreCheckpoint}
                onRetry={() => void history.refreshHistory()}
                onClose={() => setRightPanelMode('links')}
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
                  />
                ) : (
                  <div className="rounded-2xl border border-dashed border-editor-border-subtle bg-[#fafbfc] px-4 py-5 text-sm text-editor-text-tertiary">
                    Плагин `Document Graph` сейчас отключен или недоступен по плану.
                  </div>
                )}
              </div>
            </section>

            <AiChatSidebar
              pageId={activePageId}
              pageTitle={activePage?.title}
              editor={activeEditor}
              enabled={isAiSidebarEnabled}
            />

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
        onClose={() => setIsPluginsModalOpen(false)}
        onTogglePlugin={(pluginId, enabled) => void togglePlugin(pluginId, enabled)}
        onToggleSettings={(pluginId, settings) => void updatePluginSettings(pluginId, settings)}
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
