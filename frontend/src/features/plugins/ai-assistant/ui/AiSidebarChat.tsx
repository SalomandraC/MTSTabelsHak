import type { Editor } from '@tiptap/core';
import { Files, Search, SendHorizontal, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  type MwsSpace,
  type WorkspaceTreeNode,
  wikiliveApi,
} from '../../../../shared/api/wikilive';
import { getEditorMarkdown } from '../model/editor-markdown';
import { useAiTableContext } from '../model/use-ai-table-context';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

type AvailableContextPage = {
  id: string;
  title: string;
};

type AvailableContextFolder = {
  id: string;
  title: string;
};

type SelectedContextDocument = {
  pageId: string;
  title: string;
  markdown: string;
  isLoading?: boolean;
};

type SelectedContextFolder = {
  folderId: string;
  title: string;
};

type ContextScope = 'currentFile' | 'documents' | 'folders' | 'space';

type AiSidebarChatProps = {
  pageId: string | null;
  spaceId: string;
  pageTitle?: string;
  editor: Editor | null;
  enabled: boolean;
  onClose: () => void;
  availablePages?: AvailableContextPage[];
  availableFolders?: AvailableContextFolder[];
  availableSpaces?: MwsSpace[];
};

function normalizeMarkdownSnippet(text: string, maxLength = 6000) {
  const trimmed = text.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength)}\n\n[...контекст сокращен...]`;
}

function buildChatContextMarkdown(
  currentTitle: string | undefined,
  currentMarkdown: string,
  extraDocuments: SelectedContextDocument[],
) {
  const sections: string[] = [];

  if (currentMarkdown.trim()) {
    sections.push(`## Текущая страница${currentTitle ? `: ${currentTitle}` : ''}\n\n${normalizeMarkdownSnippet(currentMarkdown)}`);
  }

  extraDocuments.forEach((document) => {
    sections.push(`## Документ${document.title ? `: ${document.title}` : ''}\n\n${normalizeMarkdownSnippet(document.markdown || 'Предпросмотр недоступен')}`);
  });

  return sections.join('\n\n---\n\n');
}

function flattenPagesFromTree(nodes: WorkspaceTreeNode[]): AvailableContextPage[] {
  return nodes.flatMap((node) => [
    ...(node.kind === 'wikiPage' && node.linkedPageId
      ? [{ id: node.linkedPageId, title: node.title }]
      : []),
    ...flattenPagesFromTree(node.children ?? []),
  ]);
}

function flattenFoldersFromTree(nodes: WorkspaceTreeNode[]): AvailableContextFolder[] {
  return nodes.flatMap((node) => [
    ...((node.kind === 'wikiFolder' || node.kind === 'mwsFolder')
      ? [{ id: node.id, title: node.title }]
      : []),
    ...flattenFoldersFromTree(node.children ?? []),
  ]);
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={['flex w-full', isUser ? 'justify-end' : 'justify-start'].join(' ')}>
      <article
        className={[
          'max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm',
          isUser
            ? 'border border-[#d7e3ff] bg-[#eef3ff] text-[#1f2f55]'
            : 'border border-[#e8ebf2] bg-white text-[#2f3136]',
        ].join(' ')}
      >
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-editor-text-tertiary">
          {isUser ? 'Вы' : 'ИИ'}
        </p>
        <p className="whitespace-pre-wrap leading-5">{message.text}</p>
      </article>
    </div>
  );
}

function ContextChip({
  title,
  loading = false,
  removable = false,
  onRemove,
}: {
  title: string;
  loading?: boolean;
  removable?: boolean;
  onRemove?: () => void;
}) {
  return (
    <div className="inline-flex max-w-full items-center gap-1 rounded-md border border-[#dde3ee] bg-white px-2 py-1 text-left text-[11px] text-[#384154]">
      <span className="min-w-0 max-w-[170px] truncate" title={title}>
        {loading ? `${title}...` : title}
      </span>
      {removable ? (
        <button
          type="button"
          onClick={onRemove}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[#7b8391] hover:bg-[#f1f4f8] hover:text-[#2a3242]"
          aria-label={`Удалить контекст ${title}`}
          title={`Удалить контекст ${title}`}
        >
          <Trash2 size={10} />
        </button>
      ) : null}
    </div>
  );
}

export function AiSidebarChat({
  pageId,
  spaceId,
  pageTitle,
  editor,
  enabled,
  onClose,
  availablePages = [],
  availableFolders = [],
  availableSpaces = [],
}: AiSidebarChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedDocuments, setSelectedDocuments] = useState<SelectedContextDocument[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<SelectedContextFolder[]>([]);
  const [contextSpaceId, setContextSpaceId] = useState(spaceId);
  const [contextScope, setContextScope] = useState<ContextScope>('currentFile');
  const [contextTree, setContextTree] = useState<WorkspaceTreeNode[] | null>(null);
  const [isContextTreeLoading, setIsContextTreeLoading] = useState(false);
  const [dragDropHint, setDragDropHint] = useState('');
  const [selectedDocumentOptionId, setSelectedDocumentOptionId] = useState('');
  const [selectedFolderOptionId, setSelectedFolderOptionId] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const contextRowRef = useRef<HTMLDivElement>(null);
  const { handleAiChatResponse } = useAiTableContext();

  const activeTreePages = useMemo(
    () => (contextSpaceId === spaceId ? availablePages : flattenPagesFromTree(contextTree ?? [])),
    [availablePages, contextSpaceId, contextTree, spaceId],
  );

  const activeTreeFolders = useMemo(
    () => (contextSpaceId === spaceId ? availableFolders : flattenFoldersFromTree(contextTree ?? [])),
    [availableFolders, contextSpaceId, contextTree, spaceId],
  );

  const currentSpacePageMap = useMemo(
    () => new Map(availablePages.map((page) => [page.id, page])),
    [availablePages],
  );

  const currentSpaceFolderMap = useMemo(
    () => new Map(availableFolders.map((folder) => [folder.id, folder])),
    [availableFolders],
  );

  const contextPages = useMemo(() => {
    const unique = new Map<string, AvailableContextPage>();

    activeTreePages.forEach((page) => {
      if (page.id && page.title) {
        unique.set(page.id, page);
      }
    });

    if (pageId && contextSpaceId === spaceId) {
      unique.delete(pageId);
    }

    selectedDocuments.forEach((document) => {
      unique.delete(document.pageId);
    });

    return Array.from(unique.values());
  }, [activeTreePages, contextSpaceId, pageId, selectedDocuments, spaceId]);

  const contextFolders = useMemo(() => {
    const unique = new Map<string, AvailableContextFolder>();

    activeTreeFolders.forEach((folder) => {
      if (folder.id && folder.title) {
        unique.set(folder.id, folder);
      }
    });

    selectedFolders.forEach((folder) => {
      unique.delete(folder.folderId);
    });

    return Array.from(unique.values());
  }, [activeTreeFolders, selectedFolders]);

  const currentMarkdown = useMemo(() => getEditorMarkdown(editor), [editor]);

  const selectedContextPayload = useMemo(
    () =>
      selectedDocuments
        .filter((document) => !document.isLoading)
        .map((document) => ({
          pageId: document.pageId,
          title: document.title,
          markdown: normalizeMarkdownSnippet(document.markdown || 'Предпросмотр недоступен'),
        })),
    [selectedDocuments],
  );

  const activeSelectedDocuments = useMemo(
    () => selectedDocuments.filter((document) => !document.isLoading),
    [selectedDocuments],
  );

  const activeSelectedPageIds = useMemo(() => {
    if (contextScope === 'currentFile') {
      return pageId ? [pageId] : [];
    }

    if (contextScope === 'documents') {
      return activeSelectedDocuments.map((document) => document.pageId);
    }

    return [];
  }, [activeSelectedDocuments, contextScope, pageId]);

  const activeSelectedFolderIds = useMemo(() => {
    if (contextScope !== 'folders') {
      return [];
    }

    return selectedFolders.map((folder) => folder.folderId);
  }, [contextScope, selectedFolders]);

  const activeContextDocuments = useMemo(() => {
    if (contextScope !== 'documents') {
      return [];
    }

    return activeSelectedDocuments;
  }, [activeSelectedDocuments, contextScope]);

  const markdownContext = useMemo(() => {
    if (contextScope !== 'currentFile') {
      return '';
    }

    return buildChatContextMarkdown(pageTitle, currentMarkdown, []);
  }, [contextScope, currentMarkdown, pageTitle]);

  const hasPendingContext = selectedDocuments.some((document) => document.isLoading);
  const hasSelectedDocumentsScope = activeSelectedPageIds.length > 0;
  const hasSelectedFoldersScope = activeSelectedFolderIds.length > 0;
  const isScopeReady =
    contextScope === 'space' ||
    (contextScope === 'currentFile' && Boolean(pageId)) ||
    (contextScope === 'documents' && hasSelectedDocumentsScope) ||
    (contextScope === 'folders' && hasSelectedFoldersScope);
  const scopeDescription =
    contextScope === 'currentFile'
      ? 'Поиск и ответ только по текущему файлу'
      : contextScope === 'documents'
        ? 'Ответ по выбранным документам'
        : contextScope === 'folders'
          ? 'Поиск только внутри выбранных папок'
          : 'Поиск по всему текущему пространству';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [errorMessage, isSending, messages, selectedDocuments.length]);

  useEffect(() => {
    const row = contextRowRef.current;

    if (!row) {
      return;
    }

    row.scrollTo({ left: row.scrollWidth, behavior: 'smooth' });
  }, [selectedDocuments.length, selectedFolders.length, contextScope]);

  useEffect(() => {
    setContextSpaceId(spaceId);
    setSelectedDocuments([]);
    setSelectedFolders([]);
    setContextScope('currentFile');
    setContextTree(null);
    setSelectedDocumentOptionId('');
    setSelectedFolderOptionId('');
  }, [pageId]);

  useEffect(() => {
    if (contextScope === 'currentFile') {
      setContextSpaceId(spaceId);
    }
  }, [contextScope, spaceId]);

  useEffect(() => {
    if ((contextScope !== 'documents' && contextScope !== 'folders') || contextSpaceId === spaceId) {
      setContextTree(null);
      return;
    }

    let cancelled = false;

    const loadContextTree = async () => {
      setIsContextTreeLoading(true);
      try {
        const response = await wikiliveApi.getWorkspaceTree(contextSpaceId);
        if (!cancelled) {
          setContextTree(response.items);
        }
      } catch (error) {
        if (!cancelled) {
          setContextTree([]);
          setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить дерево выбранного пространства');
        }
      } finally {
        if (!cancelled) {
          setIsContextTreeLoading(false);
        }
      }
    };

    void loadContextTree();

    return () => {
      cancelled = true;
    };
  }, [contextScope, contextSpaceId, spaceId]);

  const handleAddDocument = async (page: AvailableContextPage) => {
    if (selectedDocuments.some((document) => document.pageId === page.id) || page.id === pageId) {
      return;
    }

    setSelectedDocuments((current) => [
      ...current,
      {
        pageId: page.id,
        title: page.title,
        markdown: '',
        isLoading: true,
      },
    ]);

    try {
      const response = await wikiliveApi.getPage(page.id);
      const markdown = response.page.plainTextPreview?.trim() || 'Предпросмотр недоступен';

      setSelectedDocuments((current) =>
        current.map((document) =>
          document.pageId === page.id ? { ...document, markdown, isLoading: false } : document,
        ),
      );
    } catch (error) {
      const markdown = error instanceof Error ? error.message : 'Не удалось загрузить контекст';

      setSelectedDocuments((current) =>
        current.map((document) =>
          document.pageId === page.id ? { ...document, markdown, isLoading: false } : document,
        ),
      );
    }
  };

  const handleAddDocumentById = async (pageIdToAdd: string) => {
    const page = contextPages.find((item) => item.id === pageIdToAdd);
    if (!page) {
      return;
    }

    setSelectedDocumentOptionId('');
    await handleAddDocument(page);
  };

  const handleRemoveDocument = (pageIdToRemove: string) => {
    setSelectedDocuments((current) => current.filter((document) => document.pageId !== pageIdToRemove));
  };

  const handleAddFolder = (folder: AvailableContextFolder) => {
    if (selectedFolders.some((current) => current.folderId === folder.id)) {
      return;
    }

    setSelectedFolders((current) => [...current, { folderId: folder.id, title: folder.title }]);
  };

  const handleRemoveFolder = (folderIdToRemove: string) => {
    setSelectedFolders((current) => current.filter((folder) => folder.folderId !== folderIdToRemove));
  };

  const handleAddFolderById = (folderIdToAdd: string) => {
    const folder = contextFolders.find((item) => item.id === folderIdToAdd);
    if (!folder) {
      return;
    }

    setSelectedFolderOptionId('');
    handleAddFolder(folder);
  };

  const handleDropOnContext = async (event: React.DragEvent<HTMLDivElement>) => {
    const droppedNodeId = event.dataTransfer.getData('application/x-wikilive-node-id');
    if (!droppedNodeId) {
      return;
    }

    event.preventDefault();
    setDragDropHint('');

    const page = currentSpacePageMap.get(droppedNodeId);
    const folder = currentSpaceFolderMap.get(droppedNodeId);

    if (page) {
      setContextScope('documents');
      setContextSpaceId(spaceId);
      await handleAddDocument(page);
      return;
    }

    if (folder) {
      setContextScope('folders');
      setContextSpaceId(spaceId);
      handleAddFolder(folder);
      return;
    }
  };

  const handleSend = async () => {
    const trimmed = draft.trim();
    if (!trimmed || isSending || hasPendingContext) {
      return;
    }

    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: trimmed }]);
    setDraft('');
    setErrorMessage('');
    setIsSending(true);

    try {
      const response = await wikiliveApi.aiChat({
        question: trimmed,
        spaceId: contextScope === 'currentFile' ? spaceId : contextSpaceId,
        pageId: contextScope === 'currentFile' ? pageId ?? undefined : undefined,
        pageTitle: contextScope === 'currentFile' ? pageTitle : undefined,
        pageSnapshot:
          contextScope === 'currentFile'
            ? {
                markdown: markdownContext,
                contextDocuments: [],
              }
            : undefined,
        selectedPageIds: activeSelectedPageIds,
        selectedFolderIds: activeSelectedFolderIds,
        contextDocuments:
          contextScope === 'documents'
            ? selectedContextPayload
            : [],
        useVectorSearch: true,
      });

      handleAiChatResponse(response);

      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: response.answer }]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось получить ответ ИИ');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white text-editor-text-primary">
      <header className="border-b border-editor-border-subtle px-6 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[#1d2023]">ИИ-ассистент</h2>
            <p className="mt-1 text-sm text-[#5f3647]">Добавляйте документы в контекст и сравнивайте их в одном диалоге.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#505762] hover:bg-[#f0f1f3]"
            aria-label="Закрыть чат ассистента"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {enabled ? (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto bg-[#fafbfd] px-4 py-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <div className="space-y-3">
              {messages.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-editor-border-subtle bg-white px-4 py-6 text-sm text-editor-text-tertiary">
                  Спросите ИИ о текущей странице или добавьте другой документ для сравнения.
                </div>
              ) : null}

              {messages.map((message) => (
                <ChatBubble key={message.id} message={message} />
              ))}

              <div ref={bottomRef} />
            </div>
          </div>

          {errorMessage ? <div className="border-t border-[#ffd2d9] bg-[#fff1f3] px-6 py-2 text-xs text-[#b00025]">{errorMessage}</div> : null}

          <form
            className="border-t border-editor-border-subtle bg-white p-2"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSend();
            }}
          >
            <div className="mb-2 mt-1 rounded-xl border border-editor-border-subtle bg-[#fafbfd] p-2">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-editor-text-tertiary">
                Область контекста
              </p>
              <div className="space-y-2">
                <label className="block text-xs text-editor-text-tertiary">
                  <span className="mb-1 block font-semibold">Тип области</span>
                  <select
                    value={contextScope}
                    onChange={(event) => setContextScope(event.target.value as ContextScope)}
                    className="w-full rounded-lg border border-editor-border-subtle bg-white px-3 py-2 text-sm text-editor-text-primary outline-none"
                  >
                    <option value="currentFile" disabled={!pageId}>Текущий файл</option>
                    <option value="documents">Конкретные документы</option>
                    <option value="folders">Конкретные папки</option>
                    <option value="space">Пространство</option>
                  </select>
                </label>

                {contextScope !== 'currentFile' ? (
                  <label className="block text-xs text-editor-text-tertiary">
                    <span className="mb-1 block font-semibold">Пространство</span>
                    <select
                      value={contextSpaceId}
                      onChange={(event) => {
                        setContextSpaceId(event.target.value);
                        setSelectedDocuments([]);
                        setSelectedFolders([]);
                        setSelectedDocumentOptionId('');
                        setSelectedFolderOptionId('');
                      }}
                      className="w-full rounded-lg border border-editor-border-subtle bg-white px-3 py-2 text-sm text-editor-text-primary outline-none"
                    >
                      {availableSpaces.map((space) => (
                        <option key={space.id} value={space.id}>
                          {space.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {contextScope === 'documents' ? (
                  <label className="block text-xs text-editor-text-tertiary">
                    <span className="mb-1 block font-semibold">Документ</span>
                    <select
                      value={selectedDocumentOptionId}
                      onChange={(event) => {
                        const nextId = event.target.value;
                        setSelectedDocumentOptionId(nextId);
                        if (nextId) {
                          void handleAddDocumentById(nextId);
                        }
                      }}
                      disabled={isContextTreeLoading}
                      className="w-full rounded-lg border border-editor-border-subtle bg-white px-3 py-2 text-sm text-editor-text-primary outline-none disabled:opacity-60"
                    >
                      <option value="">Выберите документ…</option>
                      {contextPages.map((page) => (
                        <option key={page.id} value={page.id}>
                          {page.title}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {contextScope === 'folders' ? (
                  <label className="block text-xs text-editor-text-tertiary">
                    <span className="mb-1 block font-semibold">Папка</span>
                    <select
                      value={selectedFolderOptionId}
                      onChange={(event) => {
                        const nextId = event.target.value;
                        setSelectedFolderOptionId(nextId);
                        if (nextId) {
                          handleAddFolderById(nextId);
                        }
                      }}
                      disabled={isContextTreeLoading}
                      className="w-full rounded-lg border border-editor-border-subtle bg-white px-3 py-2 text-sm text-editor-text-primary outline-none disabled:opacity-60"
                    >
                      <option value="">Выберите папку…</option>
                      {contextFolders.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.title}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              <p className="mt-2 text-xs text-editor-text-tertiary">{scopeDescription}</p>
            </div>

            <div
              className={[
                'mb-1 mt-1 rounded-lg border bg-[#f8fafd] px-2 py-1.5 transition-colors',
                dragDropHint ? 'border-[#d70032] ring-1 ring-[#ffd2d9]' : 'border-editor-border-subtle',
              ].join(' ')}
              onDragOver={(event) => {
                const droppedNodeId = event.dataTransfer.getData('application/x-wikilive-node-id');
                if (!droppedNodeId) {
                  return;
                }

                event.preventDefault();
                const canDropDocument = Boolean(currentSpacePageMap.get(droppedNodeId));
                const canDropFolder = Boolean(currentSpaceFolderMap.get(droppedNodeId));

                if (canDropDocument || canDropFolder) {
                  setDragDropHint('Отпустите, чтобы добавить в контекст');
                }
              }}
              onDragLeave={() => setDragDropHint('')}
              onDrop={(event) => void handleDropOnContext(event)}
            >
              <div
                ref={contextRowRef}
                className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              >
                {contextScope === 'currentFile' && pageId ? <ContextChip title={pageTitle ?? 'Текущая страница'} /> : null}
                {contextScope === 'documents' &&
                  selectedDocuments.map((document) => (
                  <ContextChip
                    key={document.pageId}
                    title={document.title}
                    loading={document.isLoading}
                    removable
                    onRemove={() => handleRemoveDocument(document.pageId)}
                  />
                ))}
                {contextScope === 'folders' &&
                  selectedFolders.map((folder) => (
                  <ContextChip
                    key={folder.folderId}
                    title={`Папка: ${folder.title}`}
                    removable
                    onRemove={() => handleRemoveFolder(folder.folderId)}
                  />
                ))}
                {((contextScope === 'currentFile' && !pageId) ||
                  (contextScope === 'documents' && selectedDocuments.length === 0) ||
                  (contextScope === 'folders' && selectedFolders.length === 0) ||
                  contextScope === 'space') ? (
                  <span className="text-[11px] text-editor-text-tertiary">Контекст не выбран</span>
                ) : null}
              </div>
              {dragDropHint ? <p className="mt-2 text-[11px] font-semibold text-[#b00025]">{dragDropHint}</p> : null}
            </div>

            <label className="sr-only" htmlFor="ai-sidebar-chat-input">
              Сообщение ИИ-ассистенту
            </label>
            <div className="flex items-stretch gap-2">
              <textarea
                id="ai-sidebar-chat-input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder="Спросите про страницу или сравните документы"
                rows={2}
                className="min-h-14 max-h-36 flex-1 resize-none rounded-xl border border-editor-border-subtle bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-[#5586ff]"
                disabled={isSending || !enabled || hasPendingContext}
              />
              <div className="flex w-11 shrink-0 self-stretch flex-col justify-between">
                <div className="inline-flex h-6 w-11 items-center justify-center rounded-lg border border-editor-border-subtle bg-white text-editor-text-secondary">
                  <Files size={13} />
                </div>
                <button
                  type="submit"
                  disabled={isSending || !draft.trim() || !enabled || hasPendingContext || !isScopeReady}
                  className="inline-flex h-7 w-11 items-center justify-center rounded-lg border border-editor-border-subtle bg-[#d70032] text-sm font-semibold text-white transition-colors hover:bg-[#b00025] disabled:cursor-not-allowed disabled:opacity-50"
                  title={
                    hasPendingContext
                      ? 'Контекст загружается'
                      : !isScopeReady
                        ? 'Выберите область контекста или добавьте элементы в выбранную область'
                        : 'Отправить'
                  }
                >
                  <SendHorizontal size={16} />
                </button>
              </div>
            </div>
          </form>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center px-8 text-center text-sm text-editor-text-tertiary">
          Модуль ИИ отключен. Включите плагин ai-assistant, чтобы пользоваться чатом.
        </div>
      )}
    </div>
  );
}
