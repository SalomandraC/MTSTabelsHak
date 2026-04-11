import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import {
  ChevronDown,
  ChevronRight,
  Database,
  FileText,
  Folder,
  Plus,
  Search,
  Sparkles,
  Table2,
  Trash2,
  Users,
  X,
} from 'lucide-react';

import { PageEditor } from '../../../features/page-editor';
import { AiChatSidebar } from '../../../features/plugins/ai-assistant';
import { PluginsModal, usePlugins } from '../../../features/plugins';
import {
  DEFAULT_WIKILIVE_SPACE_ID,
  type Backlink,
  type MwsSpace,
  type OutgoingLink,
  type WikiPage,
  type WorkspaceTreeNode,
  wikiliveApi,
} from '../../../shared/api/wikilive';
import { DocumentLinkGraph, type DocumentGraphEdge, type DocumentGraphPage } from './document-link-graph';

const SELECTED_SPACE_STORAGE_KEY = 'wikilive:selected-space-id';

type WorkspaceRouteState = {
  spaceId: string | null;
  pageId: string | null;
};

function readWorkspaceRoute(): WorkspaceRouteState {
  const url = new URL(window.location.href);
  const routeMatch = url.pathname.match(/^\/spaces\/([^/]+)(?:\/pages\/([^/]+))?/);

  if (routeMatch) {
    return {
      spaceId: decodeURIComponent(routeMatch[1] ?? ''),
      pageId: routeMatch[2] ? decodeURIComponent(routeMatch[2]) : null,
    };
  }

  return {
    spaceId: url.searchParams.get('spaceId'),
    pageId: url.searchParams.get('pageId'),
  };
}

function writeWorkspaceRoute(spaceId: string, pageId: string | null, mode: 'push' | 'replace' = 'push') {
  const url = new URL(window.location.href);
  url.pathname = pageId
    ? `/spaces/${encodeURIComponent(spaceId)}/pages/${encodeURIComponent(pageId)}`
    : `/spaces/${encodeURIComponent(spaceId)}`;
  url.searchParams.delete('spaceId');
  url.searchParams.delete('pageId');

  window.history[mode === 'push' ? 'pushState' : 'replaceState']({}, '', url);
}

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

function getWorkspaceNodeIcon(node: WorkspaceTreeNode) {
  if (node.kind === 'mwsFolder') {
    return <Folder size={18} strokeWidth={1.8} />;
  }

  if (node.kind === 'mwsTable') {
    return <Table2 size={17} strokeWidth={1.9} />;
  }

  if (node.kind === 'mwsNode') {
    return <Database size={17} strokeWidth={1.8} />;
  }

  return <FileText size={17} strokeWidth={1.8} />;
}

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
}) {
  const hasChildren = node.children.length > 0;
  const isExpandable = node.kind === 'mwsFolder' || hasChildren;
  const isExpanded = isExpandable ? expandedFolderIds.has(node.id) : false;
  const isActivePage = node.linkedPageId === activePageId;
  const isSelectedTable = node.kind === 'mwsTable' && node.id === selectedTableNodeId;
  const itemPadding = 8 + depth * 22;

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

        {node.kind === 'wikiPage' && node.linkedPageId ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDeletePage(node.linkedPageId!, node.title);
            }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#b6b6b6] opacity-0 transition-opacity hover:bg-[#fff1f3] hover:text-[#d70032] group-hover:opacity-100"
            title="Удалить страницу"
            aria-label={`Удалить страницу ${node.title}`}
          >
            <Trash2 size={14} strokeWidth={2.2} />
          </button>
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

  const isBusy = isCreating || isDeleting;

  return (
    <div className="fixed inset-0 z-[80] bg-black/30" onMouseDown={onClose}>
      <section
        className="fixed left-1/2 top-1/2 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-editor-border-subtle bg-white shadow-[0_24px_70px_rgba(17,25,40,0.24)]"
        role="dialog"
        aria-modal="true"
        aria-label="Действия с MWS таблицей"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-editor-border-subtle p-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#d70032]">MWS Tables</p>
            <h3 className="mt-2 truncate font-wide text-xl font-semibold text-[#1f1f1f]">{node.title}</h3>
            <p className="mt-2 text-sm text-editor-text-tertiary">
              Таблица остается живой сущностью MWS. WikiLive может создать рядом страницу с embedded live-таблицей.
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
        <div className="grid gap-3 p-5">
          <button
            type="button"
            onClick={onCreatePage}
            disabled={isBusy}
            className="rounded-xl bg-[#d70032] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#b8002b] disabled:cursor-wait disabled:opacity-60"
          >
            {isCreating ? 'Создаем страницу...' : 'Создать страницу с таблицей'}
          </button>
          <button
            type="button"
            onClick={onOpenMws}
            className="rounded-xl border border-[#1f1f1f] bg-white px-4 py-3 text-sm font-semibold text-[#1f1f1f] transition-colors hover:bg-[#f2f3f5]"
          >
            Перейти на таблицу в tables.mws.ru
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={isBusy}
            className="rounded-xl border border-[#ffd2d9] bg-[#fff7f8] px-4 py-3 text-sm font-semibold text-[#b00025] transition-colors hover:border-[#d70032] hover:bg-[#fff1f3] disabled:cursor-wait disabled:opacity-60"
          >
            {isDeleting ? 'Удаляем таблицу...' : 'Удалить таблицу'}
          </button>
        </div>
      </section>
    </div>
  );
}

export function WorkspacePage() {
  const {
    items: plugins,
    plan,
    isLoading: isPluginsLoading,
    errorMessage: pluginsErrorMessage,
    pendingPluginId,
    togglePlugin,
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

  const visibleTree = useMemo(() => filterWorkspaceTree(tree, searchQuery), [searchQuery, tree]);
  const hasSearch = searchQuery.trim().length > 0;
  const isDocumentGraphEnabled = isWorkspaceSidebarEnabled('document-graph');
  const isAiSidebarEnabled = isWorkspaceSidebarEnabled('sidebar');
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

      if (preferredPageId && pages.some((page) => page.id === preferredPageId)) {
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
        const nextSpaceId = routeSpaceId && nextSpaces.some((space) => space.id === routeSpaceId)
          ? routeSpaceId
          : nextSpaces.some((space) => space.id === storedSpaceId)
            ? storedSpaceId
            : nextSpaces[0]?.id ?? DEFAULT_WIKILIVE_SPACE_ID;

        setSpaces(nextSpaces);
        setSelectedSpaceId(nextSpaceId ?? DEFAULT_WIKILIVE_SPACE_ID);
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

  useEffect(() => {
    let cancelled = false;

    if (!selectedSpaceId) {
      return;
    }

    localStorage.setItem(SELECTED_SPACE_STORAGE_KEY, selectedSpaceId);
    setActivePage(null);
    setActivePageId(null);
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
    if (!selectedSpaceId) {
      return;
    }

    writeWorkspaceRoute(selectedSpaceId, activePageId, 'replace');
  }, [activePageId, selectedSpaceId]);

  useEffect(() => {
    if (!activePageId) {
      return;
    }

    let cancelled = false;
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

  const handleCreatePage = async () => {
    const title = `Страница ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
    setStatusMessage('Создаем страницу');

    try {
      const created = await wikiliveApi.createPage(selectedSpaceId, title);
      await refreshTree(selectedSpaceId, created.page.id);
      setActivePageId(created.page.id);
      writeWorkspaceRoute(selectedSpaceId, created.page.id, 'push');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось создать страницу');
    } finally {
      setStatusMessage('');
    }
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

  const handleCheckpoint = async () => {
    if (!activePageId) {
      return;
    }

    await Promise.all([refreshActivePage(activePageId), refreshTree(selectedSpaceId, activePageId)]);
  };

  return (
    <main className="flex min-h-screen bg-[#f2f5fb] text-editor-text-primary">
      <aside className="flex w-[296px] shrink-0 flex-col border-r border-[#e5e6eb] bg-white">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex min-w-0 items-center gap-3">
            <WorkspaceLogo />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-[#1f1f1f]">WikiLive</p>
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
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#696969] transition-colors hover:bg-[#f2f3f5]"
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

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-2" id="WORKBENCH_SIDE_NODE_WRAPPER">
          {workbenchTab === 'favorite' ? (
            <div className="px-3 py-6 text-sm text-[#969fa8]">Закрепленных страниц пока нет</div>
          ) : (
            <>
              {isLoading ? <p className="px-2 py-2 text-sm text-[#969fa8]">Загрузка дерева...</p> : null}
              {!isLoading && tree.length === 0 ? <p className="px-2 py-2 text-sm text-[#969fa8]">MWS-дерево пустое</p> : null}
              {!isLoading && hasSearch && visibleTree.length === 0 ? (
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
                  />
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="flex h-12 items-center justify-center gap-4 border-t border-[#e5e6eb]">
          <button type="button" className="flex h-8 w-8 items-center justify-center rounded-md text-[#30c28b] hover:bg-[#f2f3f5]" title="Корзина">
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
          <button type="button" className="flex h-8 w-8 items-center justify-center rounded-md text-[#7b67ee] hover:bg-[#f2f3f5]" title="Пригласить">
            <Users size={18} strokeWidth={2.1} />
          </button>
        </div>
      </aside>

      <section className="min-w-0 flex-1">
        {errorMessage ? (
          <div className="border-b border-[#ffd2d9] bg-[#fff1f3] px-4 py-2 text-sm text-[#b00025]">{errorMessage}</div>
        ) : null}
        {statusMessage ? (
          <div className="border-b border-editor-border-subtle bg-white px-4 py-2 text-sm text-editor-text-tertiary">{statusMessage}</div>
        ) : null}
        <PageEditor
          spaceId={selectedSpaceId}
          page={activePage}
          onRenamePage={handleRenamePage}
          onCheckpoint={handleCheckpoint}
          onEditorChange={setActiveEditor}
        />
      </section>

      <aside className="hidden w-80 shrink-0 flex-col border-l border-editor-border-subtle bg-white/95 xl:flex">
        <div className="border-b border-editor-border-subtle p-4">
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
          {activePageId ? (
            <button
              type="button"
              onClick={() => void handleDeletePage(activePageId, activePage?.title ?? 'Без названия')}
              disabled={isDeletingPage}
              className="mt-2 w-full rounded-lg border border-[#ffd2d9] bg-[#fff7f8] px-3 py-2 text-sm font-semibold text-[#b00025] transition-colors hover:border-[#d70032] hover:bg-[#fff1f3] disabled:cursor-wait disabled:opacity-60"
            >
              {isDeletingPage ? 'Удаляем страницу...' : 'Удалить страницу'}
            </button>
          ) : null}
        </div>
        <div className="space-y-5 overflow-y-auto p-4">
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
                <DocumentLinkGraph pages={flattenWorkspacePages(tree)} activePageId={activePageId} edges={graphEdges} onSelectPage={handleSelectPage} />
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
                  {link.excerpt ? <span className="mt-1 block truncate text-xs text-editor-text-tertiary">{link.excerpt}</span> : null}
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
      </aside>

      <PluginsModal
        isOpen={isPluginsModalOpen}
        items={plugins}
        plan={plan}
        isLoading={isPluginsLoading}
        errorMessage={pluginsErrorMessage}
        pendingPluginId={pendingPluginId}
        onClose={() => setIsPluginsModalOpen(false)}
        onTogglePlugin={(pluginId, enabled) => void togglePlugin(pluginId, enabled)}
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
    </main>
  );
}
