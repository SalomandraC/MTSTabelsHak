import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Archive,
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  MoreVertical,
  PenLine,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';

import { PageEditor } from '../../../features/page-editor';
import {
  DEFAULT_WIKILIVE_SPACE_ID,
  type Backlink,
  type MwsSpace,
  type OutgoingLink,
  type WikiPage,
  type WikiTreeNode,
  wikiliveApi,
} from '../../../shared/api/wikilive';
import { DocumentLinkGraph, type DocumentGraphEdge } from './document-link-graph';

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

function flattenPages(nodes: WikiTreeNode[]): WikiTreeNode[] {
  return nodes.flatMap((node) => [
    ...(node.type === 'page' ? [node] : []),
    ...flattenPages(node.children ?? []),
  ]);
}

function flattenFolders(nodes: WikiTreeNode[]): WikiTreeNode[] {
  return nodes.flatMap((node) => [
    ...(node.type === 'folder' ? [node] : []),
    ...flattenFolders(node.children ?? []),
  ]);
}

function findNode(nodes: WikiTreeNode[], nodeId: string | null): WikiTreeNode | null {
  if (!nodeId) {
    return null;
  }

  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }

    const child = findNode(node.children ?? [], nodeId);
    if (child) {
      return child;
    }
  }

  return null;
}

function collectFolderIds(nodes: WikiTreeNode[]): string[] {
  return nodes.flatMap((node) => [
    ...(node.type === 'folder' ? [node.id] : []),
    ...collectFolderIds(node.children ?? []),
  ]);
}

function filterTree(nodes: WikiTreeNode[], query: string): WikiTreeNode[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return nodes;
  }

  return nodes
    .map((node) => {
      const children = filterTree(node.children ?? [], normalizedQuery);
      const isMatched = node.title.toLowerCase().includes(normalizedQuery);

      if (!isMatched && children.length === 0) {
        return null;
      }

      return {
        ...node,
        children,
      };
    })
    .filter((node): node is WikiTreeNode => Boolean(node));
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

function FolderOptions({ folders, excludeId }: { folders: WikiTreeNode[]; excludeId?: string }) {
  const availableFolders = folders.filter((folder) => folder.id !== excludeId);

  return (
    <>
      <option value="">Корень</option>
      {availableFolders.map((folder) => (
        <option key={folder.id} value={folder.id}>
          {folder.title}
        </option>
      ))}
    </>
  );
}

function CatalogActionButton({
  icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-[#696969] transition-colors hover:bg-[#f2f3f5] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function TreeItem({
  node,
  depth,
  activePageId,
  selectedFolderId,
  folders,
  expandedFolderIds,
  openMenuNodeId,
  onSelectPage,
  onSelectFolder,
  onToggleFolder,
  onOpenMenu,
  onCreatePageInFolder,
  onCreateFolderInFolder,
  onRenamePage,
  onArchivePage,
  onRenameFolder,
  onArchiveFolder,
  onMoveNode,
}: {
  node: WikiTreeNode;
  depth: number;
  activePageId: string | null;
  selectedFolderId: string | null;
  folders: WikiTreeNode[];
  expandedFolderIds: Set<string>;
  openMenuNodeId: string | null;
  onSelectPage: (pageId: string) => void;
  onSelectFolder: (folderId: string) => void;
  onToggleFolder: (folderId: string) => void;
  onOpenMenu: (nodeId: string | null) => void;
  onCreatePageInFolder: (folderId: string) => void;
  onCreateFolderInFolder: (folderId: string) => void;
  onRenamePage: (page: WikiTreeNode) => void;
  onArchivePage: (page: WikiTreeNode) => void;
  onRenameFolder: (folder: WikiTreeNode) => void;
  onArchiveFolder: (folder: WikiTreeNode) => void;
  onMoveNode: (nodeId: string, parentId: string | null) => void;
}) {
  const isActivePage = node.id === activePageId;
  const isSelectedFolder = node.type === 'folder' && node.id === selectedFolderId;
  const isExpanded = node.type === 'folder' ? expandedFolderIds.has(node.id) : false;
  const hasChildren = node.children.length > 0;
  const isMenuOpen = openMenuNodeId === node.id;
  const itemPadding = 8 + depth * 22;

  return (
    <li className="treeItemRoot relative" tabIndex={-1}>
      <div
        className={[
          'group flex h-8 items-center rounded-md pr-1 text-sm transition-colors',
          node.type === 'page' ? 'text-[#303030] hover:bg-[#f2f3f5]' : 'text-[#4d4d4d] hover:bg-[#f2f3f5]',
          isActivePage || isSelectedFolder ? 'bg-[#eef3ff] font-semibold text-[#2d5bd1]' : '',
        ].join(' ')}
        style={{ paddingLeft: itemPadding }}
        draggable
        data-test-id="treeNodeItem"
      >
        {node.type === 'folder' ? (
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
            if (node.type === 'page') {
              onSelectPage(node.id);
              return;
            }

            onSelectFolder(node.id);
            if (!isExpanded) {
              onToggleFolder(node.id);
            }
          }}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className={node.type === 'folder' ? 'text-[#df9b50]' : 'text-[#7a7f88]'}>
            {node.type === 'folder' ? <Folder size={18} strokeWidth={1.8} /> : <FileText size={17} strokeWidth={1.8} />}
          </span>
          <span className="truncate">{node.title}</span>
        </button>

        {node.type === 'folder' ? (
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onCreatePageInFolder(node.id);
              }}
              className="flex h-6 w-6 items-center justify-center rounded text-[#8d8d8d] hover:bg-white hover:text-[#2d5bd1]"
              title="Создать страницу внутри"
            >
              <Plus size={15} strokeWidth={2.4} />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenMenu(isMenuOpen ? null : node.id);
              }}
              className="flex h-6 w-6 items-center justify-center rounded text-[#b6b6b6] hover:bg-white hover:text-[#696969]"
              title="Действия"
            >
              <MoreVertical size={15} strokeWidth={2.4} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenMenu(isMenuOpen ? null : node.id);
            }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#b6b6b6] opacity-0 transition-opacity hover:bg-white hover:text-[#696969] group-hover:opacity-100"
            title="Действия"
          >
            <MoreVertical size={15} strokeWidth={2.4} />
          </button>
        )}
      </div>

      {isMenuOpen ? (
        <div className="absolute right-2 z-20 mt-1 w-56 rounded-md border border-[#e4e5e8] bg-white p-1 text-xs text-[#333] shadow-lg">
          {node.type === 'folder' ? (
            <>
              <button
                type="button"
                onClick={() => {
                  onCreatePageInFolder(node.id);
                  onOpenMenu(null);
                }}
                className="flex h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-[#f2f3f5]"
              >
                <FilePlus2 size={14} /> Страница внутри
              </button>
              <button
                type="button"
                onClick={() => {
                  onCreateFolderInFolder(node.id);
                  onOpenMenu(null);
                }}
                className="flex h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-[#f2f3f5]"
              >
                <FolderPlus size={14} /> Подпапка
              </button>
              <button
                type="button"
                onClick={() => {
                  onRenameFolder(node);
                  onOpenMenu(null);
                }}
                className="flex h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-[#f2f3f5]"
              >
                <PenLine size={14} /> Переименовать
              </button>
              <button
                type="button"
                onClick={() => {
                  onArchiveFolder(node);
                  onOpenMenu(null);
                }}
                className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[#b00025] hover:bg-[#fff1f3]"
              >
                <Archive size={14} /> Архивировать
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  onRenamePage(node);
                  onOpenMenu(null);
                }}
                className="flex h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-[#f2f3f5]"
              >
                <PenLine size={14} /> Переименовать
              </button>
              <label className="mt-1 block px-2 pb-1 text-[11px] font-semibold text-[#8c8c8c]">Переместить в</label>
              <select
                aria-label={`Переместить страницу ${node.title}`}
                value={node.parentId ?? ''}
                onChange={(event) => {
                  onMoveNode(node.id, event.target.value || null);
                  onOpenMenu(null);
                }}
                className="mb-1 h-8 w-full rounded border border-[#d7d9dd] bg-white px-2 text-xs outline-none focus:border-[#5586ff]"
              >
                <FolderOptions folders={folders} excludeId={node.id} />
              </select>
              <button
                type="button"
                onClick={() => {
                  onArchivePage(node);
                  onOpenMenu(null);
                }}
                className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[#b00025] hover:bg-[#fff1f3]"
              >
                <Archive size={14} /> Архивировать
              </button>
            </>
          )}
        </div>
      ) : null}

      {node.type === 'folder' && isExpanded && hasChildren ? (
        <ul className="group" role="group" aria-labelledby="tree_label">
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              activePageId={activePageId}
              selectedFolderId={selectedFolderId}
              folders={folders}
              expandedFolderIds={expandedFolderIds}
              openMenuNodeId={openMenuNodeId}
              onSelectPage={onSelectPage}
              onSelectFolder={onSelectFolder}
              onToggleFolder={onToggleFolder}
              onOpenMenu={onOpenMenu}
              onCreatePageInFolder={onCreatePageInFolder}
              onCreateFolderInFolder={onCreateFolderInFolder}
              onRenamePage={onRenamePage}
              onArchivePage={onArchivePage}
              onRenameFolder={onRenameFolder}
              onArchiveFolder={onArchiveFolder}
              onMoveNode={onMoveNode}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function WorkspacePage() {
  const initialRoute = useMemo(() => readWorkspaceRoute(), []);
  const pendingRoutePageIdRef = useRef(initialRoute.pageId);
  const [spaces, setSpaces] = useState<MwsSpace[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState(initialRoute.spaceId ?? DEFAULT_WIKILIVE_SPACE_ID);
  const [tree, setTree] = useState<WikiTreeNode[]>([]);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [openMenuNodeId, setOpenMenuNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [workbenchTab, setWorkbenchTab] = useState<'catalog' | 'favorite'>('catalog');
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<WikiPage | null>(null);
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [outgoingLinks, setOutgoingLinks] = useState<OutgoingLink[]>([]);
  const [graphEdges, setGraphEdges] = useState<DocumentGraphEdge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState('Загружаем wiki workspace');
  const [errorMessage, setErrorMessage] = useState('');
  const [shareStatus, setShareStatus] = useState('');

  const folders = useMemo(() => flattenFolders(tree), [tree]);
  const visibleTree = useMemo(() => filterTree(tree, searchQuery), [searchQuery, tree]);
  const hasSearch = searchQuery.trim().length > 0;
  const effectiveExpandedFolderIds = useMemo(
    () => (hasSearch ? new Set(collectFolderIds(visibleTree)) : expandedFolderIds),
    [expandedFolderIds, hasSearch, visibleTree],
  );

  const refreshGraphLinks = useCallback(async (nodes: WikiTreeNode[]) => {
    const pages = flattenPages(nodes);
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
      const response = await wikiliveApi.getWikiTree(spaceId);
      let nextTree = response.items;
      let pages = flattenPages(nextTree);
      let nextActivePageId: string | null = null;

      if (pages.length === 0) {
        const created = await wikiliveApi.createPage(spaceId, 'Новая страница');
        const refreshed = await wikiliveApi.getWikiTree(spaceId);
        nextTree = refreshed.items;
        pages = flattenPages(nextTree);
        nextActivePageId = created.page.id;
      } else if (preferredPageId && pages.some((page) => page.id === preferredPageId)) {
        nextActivePageId = preferredPageId;
      } else {
        nextActivePageId = pages[0].id;
      }

      setTree(nextTree);
      setActivePageId(nextActivePageId);
      setSelectedFolderId((current) => (findNode(nextTree, current)?.type === 'folder' ? current : null));
      setExpandedFolderIds((current) => {
        const nextIds = new Set(current);
        collectFolderIds(nextTree).forEach((folderId) => nextIds.add(folderId));
        return nextIds;
      });
      await refreshGraphLinks(nextTree).catch(() => setGraphEdges([]));
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
    setSelectedFolderId(null);
    setBacklinks([]);
    setOutgoingLinks([]);
    setOpenMenuNodeId(null);
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
    const handlePopState = () => {
      const route = readWorkspaceRoute();

      if (route.spaceId && route.spaceId !== selectedSpaceId) {
        pendingRoutePageIdRef.current = route.pageId;
        setSelectedSpaceId(route.spaceId);
        return;
      }

      if (route.pageId) {
        setSelectedFolderId(null);
        setOpenMenuNodeId(null);
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
    setSelectedFolderId(null);
    setOpenMenuNodeId(null);
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

  const handleCreatePage = async (parentNodeId: string | null = selectedFolderId) => {
    const title = `Страница ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
    setStatusMessage('Создаем страницу');

    try {
      const created = await wikiliveApi.createPage(selectedSpaceId, title, parentNodeId);
      await refreshTree(selectedSpaceId, created.page.id);
      setSelectedFolderId(parentNodeId);
      if (parentNodeId) {
        setExpandedFolderIds((current) => new Set(current).add(parentNodeId));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось создать страницу');
    } finally {
      setStatusMessage('');
    }
  };

  const handleCreateFolder = async (parentNodeId: string | null = selectedFolderId) => {
    const title = window.prompt('Название папки', 'Новая папка')?.trim();
    if (!title) {
      return;
    }

    setStatusMessage('Создаем папку');

    try {
      const created = await wikiliveApi.createFolder({
        spaceId: selectedSpaceId,
        parentNodeId,
        title,
      });
      await refreshTree(selectedSpaceId, activePageId);
      setSelectedFolderId(created.folder.id);
      if (parentNodeId) {
        setExpandedFolderIds((current) => new Set(current).add(parentNodeId));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось создать папку');
    } finally {
      setStatusMessage('');
    }
  };

  const handleRenameFolder = async (folder: WikiTreeNode) => {
    const title = window.prompt('Новое название папки', folder.title)?.trim();
    if (!title || title === folder.title) {
      return;
    }

    try {
      await wikiliveApi.updateFolder(folder.id, { title });
      await refreshTree(selectedSpaceId, activePageId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось переименовать папку');
    }
  };

  const handleRenamePageNode = async (page: WikiTreeNode) => {
    const title = window.prompt('Новое название страницы', page.title)?.trim();
    if (!title || title === page.title) {
      return;
    }

    try {
      const response = await wikiliveApi.updatePage(page.id, { title });
      if (activePageId === page.id) {
        setActivePage(response.page);
      }
      await refreshTree(selectedSpaceId, activePageId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось переименовать страницу');
    }
  };

  const handleArchivePage = async (page: WikiTreeNode) => {
    if (!window.confirm(`Архивировать страницу "${page.title}"?`)) {
      return;
    }

    try {
      await wikiliveApi.deletePage(page.id);
      await refreshTree(selectedSpaceId, activePageId === page.id ? null : activePageId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось архивировать страницу');
    }
  };

  const handleArchiveFolder = async (folder: WikiTreeNode) => {
    if (!window.confirm(`Архивировать папку "${folder.title}" и все вложенные страницы?`)) {
      return;
    }

    try {
      await wikiliveApi.deleteFolder(folder.id);
      await refreshTree(selectedSpaceId, activePageId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось архивировать папку');
    }
  };

  const handleMoveNode = async (nodeId: string, parentId: string | null) => {
    try {
      await wikiliveApi.moveNode(nodeId, { targetParentId: parentId });
      await refreshTree(selectedSpaceId, activePageId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось переместить ноду');
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
              placeholder="Найти страницу или папку"
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

        <div className="mt-3 flex items-center gap-1 px-3">
          <CatalogActionButton icon={<Plus size={15} strokeWidth={2.4} />} label="Добавить" onClick={() => void handleCreatePage()} />
          <CatalogActionButton icon={<Upload size={15} strokeWidth={2.1} />} label="Импорт" disabled />
          <CatalogActionButton icon={<FolderPlus size={15} strokeWidth={2.1} />} label="Папка" onClick={() => void handleCreateFolder()} />
        </div>

        {selectedFolderId ? (
          <p className="mx-4 mt-2 rounded-md bg-[#f6f8fb] px-2 py-1 text-xs text-[#7c8490]">Новые элементы попадут в выбранную папку.</p>
        ) : null}

        <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-2" id="WORKBENCH_SIDE_NODE_WRAPPER">
          {workbenchTab === 'favorite' ? (
            <div className="px-3 py-6 text-sm text-[#969fa8]">Закрепленных страниц пока нет</div>
          ) : (
            <>
              {isLoading ? <p className="px-2 py-2 text-sm text-[#969fa8]">Загрузка дерева...</p> : null}
              {!isLoading && tree.length === 0 ? <p className="px-2 py-2 text-sm text-[#969fa8]">Пока нет страниц</p> : null}
              {!isLoading && hasSearch && visibleTree.length === 0 ? (
                <p className="px-2 py-2 text-sm text-[#969fa8]">Ничего не найдено</p>
              ) : null}
              <ul role="tree" aria-label="Проводник" className="treeViewRoot space-y-0.5" tabIndex={0}>
                {visibleTree.map((node) => (
                  <TreeItem
                    key={node.id}
                    node={node}
                    depth={0}
                    activePageId={activePageId}
                    selectedFolderId={selectedFolderId}
                    folders={folders}
                    expandedFolderIds={effectiveExpandedFolderIds}
                    openMenuNodeId={openMenuNodeId}
                    onSelectPage={handleSelectPage}
                    onSelectFolder={(folderId) => {
                      setSelectedFolderId(folderId);
                      setOpenMenuNodeId(null);
                    }}
                    onToggleFolder={handleToggleFolder}
                    onOpenMenu={setOpenMenuNodeId}
                    onCreatePageInFolder={(folderId) => void handleCreatePage(folderId)}
                    onCreateFolderInFolder={(folderId) => void handleCreateFolder(folderId)}
                    onRenamePage={(page) => void handleRenamePageNode(page)}
                    onArchivePage={(page) => void handleArchivePage(page)}
                    onRenameFolder={(folder) => void handleRenameFolder(folder)}
                    onArchiveFolder={(folder) => void handleArchiveFolder(folder)}
                    onMoveNode={(nodeId, parentId) => void handleMoveNode(nodeId, parentId)}
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
          <button type="button" className="flex h-8 w-8 items-center justify-center rounded-md text-[#5586ff] hover:bg-[#f2f3f5]" title="Шаблоны">
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
        <PageEditor spaceId={selectedSpaceId} page={activePage} onRenamePage={handleRenamePage} onCheckpoint={handleCheckpoint} />
      </section>

      <aside className="hidden w-80 shrink-0 flex-col border-l border-editor-border-subtle bg-white/95 xl:flex">
        <div className="border-b border-editor-border-subtle p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-editor-text-tertiary">Связи</p>
          <h2 className="mt-1 font-wide text-base font-semibold">{activePage?.title ?? 'Страница не выбрана'}</h2>
          <button
            type="button"
            onClick={() => void handleCopyShareLink()}
            className="mt-3 w-full rounded-lg border border-editor-border-subtle bg-white px-3 py-2 text-sm font-semibold text-editor-text-secondary transition-colors hover:bg-editor-bg-control"
          >
            {shareStatus || 'Скопировать ссылку'}
          </button>
        </div>
        <div className="space-y-5 overflow-y-auto p-4">
          <section>
            <h3 className="text-sm font-semibold">Граф страниц</h3>
            <div className="mt-2">
              <DocumentLinkGraph pages={flattenPages(tree)} activePageId={activePageId} edges={graphEdges} onSelectPage={handleSelectPage} />
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
    </main>
  );
}
