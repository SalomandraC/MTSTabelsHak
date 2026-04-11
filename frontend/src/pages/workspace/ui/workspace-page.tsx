import { useCallback, useEffect, useMemo, useState } from 'react';

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

function FolderOptions({ folders }: { folders: WikiTreeNode[] }) {
  return (
    <>
      <option value="">Корень</option>
      {folders.map((folder) => (
        <option key={folder.id} value={folder.id}>
          {folder.title}
        </option>
      ))}
    </>
  );
}

function TreeItem({
  node,
  activePageId,
  selectedFolderId,
  folders,
  onSelectPage,
  onSelectFolder,
  onCreatePageInFolder,
  onCreateFolderInFolder,
  onRenameFolder,
  onArchiveFolder,
  onMoveNode,
}: {
  node: WikiTreeNode;
  activePageId: string | null;
  selectedFolderId: string | null;
  folders: WikiTreeNode[];
  onSelectPage: (pageId: string) => void;
  onSelectFolder: (folderId: string) => void;
  onCreatePageInFolder: (folderId: string) => void;
  onCreateFolderInFolder: (folderId: string) => void;
  onRenameFolder: (folder: WikiTreeNode) => void;
  onArchiveFolder: (folder: WikiTreeNode) => void;
  onMoveNode: (nodeId: string, parentId: string | null) => void;
}) {
  const isActivePage = node.id === activePageId;
  const isSelectedFolder = node.type === 'folder' && node.id === selectedFolderId;
  const folderChoices = folders.filter((folder) => folder.id !== node.id);

  return (
    <li>
      <div
        className={[
          'group flex items-center gap-1 rounded-lg px-2 py-1 text-sm transition-colors',
          node.type === 'page' ? 'text-editor-text-primary hover:bg-editor-bg-control' : 'text-editor-text-tertiary hover:bg-editor-bg-control',
          isActivePage || isSelectedFolder ? 'bg-[#eef2ff] font-semibold text-[#2f4d86]' : '',
        ].join(' ')}
      >
        <button
          type="button"
          onClick={() => (node.type === 'page' ? onSelectPage(node.id) : onSelectFolder(node.id))}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="w-4 shrink-0 text-center">{node.type === 'folder' ? '▸' : '•'}</span>
          <span className="truncate">{node.title}</span>
        </button>

        {node.type === 'folder' ? (
          <div className="flex shrink-0 items-center gap-1 text-[11px] font-semibold opacity-0 transition-opacity group-hover:opacity-100">
            <button type="button" onClick={() => onCreatePageInFolder(node.id)} className="rounded border border-editor-border-subtle px-1.5 py-0.5">
              +стр
            </button>
            <button type="button" onClick={() => onCreateFolderInFolder(node.id)} className="rounded border border-editor-border-subtle px-1.5 py-0.5">
              +пап
            </button>
            <button type="button" onClick={() => onRenameFolder(node)} className="rounded border border-editor-border-subtle px-1.5 py-0.5">
              имя
            </button>
            <button type="button" onClick={() => onArchiveFolder(node)} className="rounded border border-editor-border-subtle px-1.5 py-0.5">
              арх
            </button>
          </div>
        ) : (
          <select
            aria-label={`Переместить страницу ${node.title}`}
            value={node.parentId ?? ''}
            onChange={(event) => onMoveNode(node.id, event.target.value || null)}
            className="hidden h-7 w-24 shrink-0 rounded border border-editor-border-subtle bg-white px-1 text-[11px] font-normal text-editor-text-tertiary group-hover:block"
          >
            <FolderOptions folders={folderChoices} />
          </select>
        )}
      </div>

      {node.children.length > 0 ? (
        <ul className="ml-3 border-l border-editor-border-subtle pl-2">
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              activePageId={activePageId}
              selectedFolderId={selectedFolderId}
              folders={folders}
              onSelectPage={onSelectPage}
              onSelectFolder={onSelectFolder}
              onCreatePageInFolder={onCreatePageInFolder}
              onCreateFolderInFolder={onCreateFolderInFolder}
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
  const [spaces, setSpaces] = useState<MwsSpace[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState(DEFAULT_WIKILIVE_SPACE_ID);
  const [tree, setTree] = useState<WikiTreeNode[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<WikiPage | null>(null);
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [outgoingLinks, setOutgoingLinks] = useState<OutgoingLink[]>([]);
  const [graphEdges, setGraphEdges] = useState<DocumentGraphEdge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState('Загружаем wiki workspace');
  const [errorMessage, setErrorMessage] = useState('');

  const folders = useMemo(() => flattenFolders(tree), [tree]);

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
        const nextSpaceId = nextSpaces.some((space) => space.id === storedSpaceId)
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
  }, []);

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

    void (async () => {
      try {
        setIsLoading(true);
        setErrorMessage('');
        setStatusMessage('Загружаем wiki workspace');
        await refreshTree(selectedSpaceId, null);
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
    setActivePageId(pageId);
  };

  const handleCreatePage = async (parentNodeId: string | null = selectedFolderId) => {
    const title = `Страница ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
    setStatusMessage('Создаем страницу');

    try {
      const created = await wikiliveApi.createPage(selectedSpaceId, title, parentNodeId);
      await refreshTree(selectedSpaceId, created.page.id);
      setSelectedFolderId(parentNodeId);
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
      <aside className="flex w-72 shrink-0 flex-col border-r border-editor-border-subtle bg-white/95">
        <div className="border-b border-editor-border-subtle p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-editor-text-tertiary">WikiLive</p>
          <label className="mt-2 block text-xs font-semibold text-editor-text-tertiary" htmlFor="workspace-space-select">
            Пространство
          </label>
          <select
            id="workspace-space-select"
            value={selectedSpaceId}
            onChange={(event) => setSelectedSpaceId(event.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-editor-border-control bg-white px-3 text-sm font-semibold outline-none focus:border-[#7b67ee]"
          >
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void handleCreatePage()}
              className="rounded-lg bg-[#ff0037] px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#df0030]"
            >
              Новая страница
            </button>
            <button
              type="button"
              onClick={() => void handleCreateFolder()}
              className="rounded-lg border border-editor-border-control bg-white px-3 py-2 text-sm font-semibold text-editor-text-primary transition-colors hover:bg-editor-bg-control"
            >
              Новая папка
            </button>
          </div>
          {selectedFolderId ? (
            <p className="mt-2 text-xs text-editor-text-tertiary">Новые элементы попадут в выбранную папку.</p>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {isLoading ? <p className="px-2 text-sm text-editor-text-tertiary">Загрузка дерева...</p> : null}
          {!isLoading && tree.length === 0 ? <p className="px-2 text-sm text-editor-text-tertiary">Пока нет страниц</p> : null}
          <ul className="space-y-1">
            {tree.map((node) => (
              <TreeItem
                key={node.id}
                node={node}
                activePageId={activePageId}
                selectedFolderId={selectedFolderId}
                folders={folders}
                onSelectPage={handleSelectPage}
                onSelectFolder={setSelectedFolderId}
                onCreatePageInFolder={(folderId) => void handleCreatePage(folderId)}
                onCreateFolderInFolder={(folderId) => void handleCreateFolder(folderId)}
                onRenameFolder={(folder) => void handleRenameFolder(folder)}
                onArchiveFolder={(folder) => void handleArchiveFolder(folder)}
                onMoveNode={(nodeId, parentId) => void handleMoveNode(nodeId, parentId)}
              />
            ))}
          </ul>
        </div>
        <div className="border-t border-editor-border-subtle p-3">
          <DocumentLinkGraph pages={flattenPages(tree)} activePageId={activePageId} edges={graphEdges} onSelectPage={handleSelectPage} />
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
        </div>
        <div className="space-y-5 overflow-y-auto p-4">
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
