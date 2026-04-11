import { useEffect, useState } from 'react';

import { PageEditor } from '../../../features/page-editor';
import {
  type Backlink,
  type OutgoingLink,
  type WikiPage,
  type WikiTreeNode,
  WIKILIVE_SPACE_ID,
  wikiliveApi,
} from '../../../shared/api/wikilive';
import { DocumentLinkGraph } from './document-link-graph';

function flattenPages(nodes: WikiTreeNode[]): WikiTreeNode[] {
  return nodes.flatMap((node) => [
    ...(node.type === 'page' ? [node] : []),
    ...flattenPages(node.children ?? []),
  ]);
}

function TreeItem({
  node,
  activePageId,
  onSelect,
}: {
  node: WikiTreeNode;
  activePageId: string | null;
  onSelect: (pageId: string) => void;
}) {
  const isActive = node.id === activePageId;

  return (
    <li>
      <button
        type="button"
        disabled={node.type !== 'page'}
        onClick={() => node.type === 'page' && onSelect(node.id)}
        className={[
          'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
          node.type === 'page' ? 'text-editor-text-primary hover:bg-editor-bg-control' : 'cursor-default text-editor-text-tertiary',
          isActive ? 'bg-[#eef2ff] font-semibold text-[#2f4d86]' : '',
        ].join(' ')}
      >
        <span className="w-4 shrink-0 text-center">{node.type === 'folder' ? '▸' : '•'}</span>
        <span className="truncate">{node.title}</span>
      </button>
      {node.children.length > 0 ? (
        <ul className="ml-3 border-l border-editor-border-subtle pl-2">
          {node.children.map((child) => (
            <TreeItem key={child.id} node={child} activePageId={activePageId} onSelect={onSelect} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function WorkspacePage() {
  const [tree, setTree] = useState<WikiTreeNode[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<WikiPage | null>(null);
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [outgoingLinks, setOutgoingLinks] = useState<OutgoingLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState('Загружаем wiki workspace');
  const [errorMessage, setErrorMessage] = useState('');

  const refreshTree = async (preferredPageId?: string | null) => {
    const response = await wikiliveApi.getWikiTree();
    let nextTree = response.items;
    let pages = flattenPages(nextTree);

    if (pages.length === 0) {
      const created = await wikiliveApi.createPage('Новая страница');
      const refreshed = await wikiliveApi.getWikiTree();
      nextTree = refreshed.items;
      pages = flattenPages(nextTree);
      setActivePageId(created.page.id);
    } else if (preferredPageId && pages.some((page) => page.id === preferredPageId)) {
      setActivePageId(preferredPageId);
    } else if (!activePageId || !pages.some((page) => page.id === activePageId)) {
      setActivePageId(pages[0].id);
    }

    setTree(nextTree);
  };

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

    void (async () => {
      try {
        setIsLoading(true);
        setErrorMessage('');
        await refreshTree(activePageId);
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
    // Initial bootstrap only; page switching is handled by the activePageId effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleCreatePage = async () => {
    const title = `Страница ${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
    setStatusMessage('Создаем страницу');

    try {
      const created = await wikiliveApi.createPage(title);
      await refreshTree(created.page.id);
      setActivePageId(created.page.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось создать страницу');
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
    await refreshTree(activePageId);
  };

  const handleCheckpoint = async () => {
    if (!activePageId) {
      return;
    }

    await Promise.all([refreshActivePage(activePageId), refreshTree(activePageId)]);
  };

  return (
    <main className="flex min-h-screen bg-[#f2f5fb] text-editor-text-primary">
      <aside className="flex w-72 shrink-0 flex-col border-r border-editor-border-subtle bg-white/95">
        <div className="border-b border-editor-border-subtle p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-editor-text-tertiary">WikiLive</p>
          <h1 className="mt-1 font-wide text-lg font-semibold">Space {WIKILIVE_SPACE_ID}</h1>
          <button
            type="button"
            onClick={handleCreatePage}
            className="mt-3 w-full rounded-lg bg-[#ff0037] px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#df0030]"
          >
            Новая страница
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {isLoading ? <p className="px-2 text-sm text-editor-text-tertiary">Загрузка дерева...</p> : null}
          {!isLoading && tree.length === 0 ? <p className="px-2 text-sm text-editor-text-tertiary">Пока нет страниц</p> : null}
          <ul className="space-y-1">
            {tree.map((node) => (
              <TreeItem key={node.id} node={node} activePageId={activePageId} onSelect={setActivePageId} />
            ))}
          </ul>
        </div>
      </aside>

      <section className="min-w-0 flex-1">
        {errorMessage ? (
          <div className="border-b border-[#ffd2d9] bg-[#fff1f3] px-4 py-2 text-sm text-[#b00025]">{errorMessage}</div>
        ) : null}
        {statusMessage ? (
          <div className="border-b border-editor-border-subtle bg-white px-4 py-2 text-sm text-editor-text-tertiary">{statusMessage}</div>
        ) : null}
        <PageEditor page={activePage} onRenamePage={handleRenamePage} onCheckpoint={handleCheckpoint} />
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
                  onClick={() => setActivePageId(link.pageId)}
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
                  onClick={() => setActivePageId(link.targetPageId)}
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

      <DocumentLinkGraph activePage={activePage} backlinks={backlinks} outgoingLinks={outgoingLinks} onSelectPage={setActivePageId} />
    </main>
  );
}
