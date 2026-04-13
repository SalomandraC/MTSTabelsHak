import type { Editor } from '@tiptap/core';
import { ChevronDown, Files, Search, SendHorizontal, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { wikiliveApi } from '../../../../shared/api/wikilive';
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

type SelectedContextDocument = {
  pageId: string;
  title: string;
  markdown: string;
  isLoading?: boolean;
};

type AiSidebarChatProps = {
  pageId: string | null;
  pageTitle?: string;
  editor: Editor | null;
  enabled: boolean;
  onClose: () => void;
  availablePages?: AvailableContextPage[];
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
  pageTitle,
  editor,
  enabled,
  onClose,
  availablePages = [],
}: AiSidebarChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedDocuments, setSelectedDocuments] = useState<SelectedContextDocument[]>([]);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [contextSearch, setContextSearch] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const { handleAiChatResponse } = useAiTableContext();

  const contextPages = useMemo(() => {
    const unique = new Map<string, AvailableContextPage>();

    availablePages.forEach((page) => {
      if (page.id && page.title) {
        unique.set(page.id, page);
      }
    });

    if (pageId) {
      unique.delete(pageId);
    }

    selectedDocuments.forEach((document) => {
      unique.delete(document.pageId);
    });

    return Array.from(unique.values());
  }, [availablePages, pageId, selectedDocuments]);

  const filteredContextPages = useMemo(() => {
    const normalizedQuery = contextSearch.trim().toLowerCase();

    if (!normalizedQuery) {
      return contextPages;
    }

    return contextPages.filter((page) => page.title.toLowerCase().includes(normalizedQuery));
  }, [contextPages, contextSearch]);

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

  const markdownContext = useMemo(
    () => buildChatContextMarkdown(pageTitle, currentMarkdown, selectedDocuments.filter((document) => !document.isLoading)),
    [currentMarkdown, pageTitle, selectedDocuments],
  );

  const hasPendingContext = selectedDocuments.some((document) => document.isLoading);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [errorMessage, isSending, messages, selectedDocuments.length]);

  useEffect(() => {
    setSelectedDocuments([]);
    setIsContextMenuOpen(false);
    setContextSearch('');
  }, [pageId]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsContextMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  const handleAddDocument = async (page: AvailableContextPage) => {
    setIsContextMenuOpen(false);
    setContextSearch('');

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

  const handleRemoveDocument = (pageIdToRemove: string) => {
    setSelectedDocuments((current) => current.filter((document) => document.pageId !== pageIdToRemove));
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
        pageId: pageId ?? undefined,
        pageTitle,
        pageSnapshot: {
          markdown: markdownContext,
          contextDocuments: selectedContextPayload,
        },
        contextDocuments: selectedContextPayload,
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
          <div className="border-b border-editor-border-subtle bg-[#f8fafd] px-4 py-2">
            <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap">
              {pageId ? <ContextChip title={pageTitle ?? 'Текущая страница'} /> : null}
              {selectedDocuments.map((document) => (
                <ContextChip
                  key={document.pageId}
                  title={document.title}
                  loading={document.isLoading}
                  removable
                  onRemove={() => handleRemoveDocument(document.pageId)}
                />
              ))}
              {!pageId && selectedDocuments.length === 0 ? (
                <span className="text-[11px] text-editor-text-tertiary">Контекст не выбран</span>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[#fafbfd] px-4 py-4">
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
            className="border-t border-editor-border-subtle bg-white p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSend();
            }}
          >
            <div
              id="ai-chat-context-panel"
              className={[
                'mb-3 grid overflow-hidden rounded-2xl border border-editor-border-subtle bg-[#fafbfd] transition-all duration-200 ease-out',
                isContextMenuOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
              ].join(' ')}
            >
              <div className="min-h-0">
                <div className="space-y-3 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-editor-text-tertiary">Выбранный контекст</p>
                      <p className="mt-1 text-xs text-editor-text-tertiary">Текущая страница уже включена. Можно добавить еще документы для сравнения.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsContextMenuOpen(false)}
                      className="rounded-full border border-editor-border-subtle bg-white px-2.5 py-1 text-[11px] font-semibold text-editor-text-secondary transition-colors hover:bg-editor-bg-control"
                    >
                      Скрыть
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {pageId ? (
                      <ContextChip title={pageTitle ?? 'Текущая страница'} />
                    ) : null}
                    {selectedDocuments.map((document) => (
                      <ContextChip
                        key={document.pageId}
                        title={document.title}
                        loading={document.isLoading}
                        removable
                        onRemove={() => handleRemoveDocument(document.pageId)}
                      />
                    ))}
                  </div>

                  <div className="rounded-xl border border-editor-border-subtle bg-white shadow-sm">
                    <div className="border-b border-editor-border-subtle p-2">
                      <div className="flex items-center gap-2 rounded-lg border border-editor-border-subtle bg-[#fafbfd] px-3 py-2">
                        <Search size={14} className="shrink-0 text-editor-text-tertiary" />
                        <input
                          value={contextSearch}
                          onChange={(event) => setContextSearch(event.target.value)}
                          placeholder="Найти документ"
                          className="w-full bg-transparent text-sm outline-none placeholder:text-editor-text-tertiary"
                        />
                      </div>
                    </div>
                    <div className="max-h-44 overflow-y-auto p-1">
                      {filteredContextPages.length > 0 ? (
                        filteredContextPages.map((page) => (
                          <button
                            key={page.id}
                            type="button"
                            onClick={() => void handleAddDocument(page)}
                            className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm text-editor-text-primary transition-colors hover:bg-editor-bg-control"
                          >
                            <span className="min-w-0 truncate">{page.title}</span>
                            <span className="shrink-0 text-[11px] text-editor-text-tertiary">Добавить</span>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-4 text-sm text-editor-text-tertiary">Документы не найдены</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <label className="sr-only" htmlFor="ai-sidebar-chat-input">
              Сообщение ИИ-ассистенту
            </label>
            <div className="flex items-end gap-2">
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
              <div className="flex h-14 w-11 shrink-0 flex-col justify-between">
                <button
                  type="button"
                  onClick={() => setIsContextMenuOpen((value) => !value)}
                  className="inline-flex h-6 w-11 items-center justify-center rounded-lg border border-editor-border-subtle bg-white text-editor-text-secondary transition-colors hover:bg-editor-bg-control"
                  aria-expanded={isContextMenuOpen}
                  aria-controls="ai-chat-context-panel"
                  aria-label={isContextMenuOpen ? 'Скрыть выбор контекста' : 'Показать выбор контекста'}
                  title={isContextMenuOpen ? 'Скрыть контекст' : 'Добавить контекст'}
                >
                  <Files size={13} />
                  <ChevronDown size={10} className={isContextMenuOpen ? 'ml-0.5 rotate-180 transition-transform' : 'ml-0.5 transition-transform'} />
                </button>
                <button
                  type="submit"
                  disabled={isSending || !draft.trim() || !enabled || hasPendingContext}
                  className="inline-flex h-7 w-11 items-center justify-center rounded-lg border border-editor-border-subtle bg-[#d70032] text-sm font-semibold text-white transition-colors hover:bg-[#b00025] disabled:cursor-not-allowed disabled:opacity-50"
                  title={hasPendingContext ? 'Контекст загружается' : 'Отправить'}
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