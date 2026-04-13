import type { Editor } from '@tiptap/core';
import { SendHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { wikiliveApi } from '../../../../shared/api/wikilive';
import { getEditorMarkdown } from '../model/editor-markdown';
import { useAiTableContext } from '../model/use-ai-table-context';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

type AiSidebarChatProps = {
  pageId: string | null;
  pageTitle?: string;
  editor: Editor | null;
  enabled: boolean;
  onClose: () => void;
};

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

export function AiSidebarChat({ pageId, pageTitle, editor, enabled, onClose }: AiSidebarChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const { handleAiChatResponse } = useAiTableContext();

  const markdownContext = useMemo(() => getEditorMarkdown(editor), [editor]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, errorMessage, isSending]);

  const handleSend = async () => {
    const trimmed = draft.trim();
    if (!trimmed || isSending) {
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
        },
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
            <p className="mt-1 text-sm text-[#5f3647]">Задавайте вопросы по тексту страницы и базе знаний.</p>
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
          <div className="min-h-0 flex-1 overflow-y-auto bg-[#fafbfd] px-4 py-4">
            <div className="space-y-3">
              {messages.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-editor-border-subtle bg-white px-4 py-6 text-sm text-editor-text-tertiary">
                  Спросите ИИ о текущей странице. В запрос автоматически попадет markdown-контекст документа.
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
                placeholder="Спросите про страницу или базу знаний"
                rows={2}
                className="min-h-14 max-h-36 flex-1 resize-none rounded-xl border border-editor-border-subtle bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-[#5586ff]"
                disabled={isSending || !enabled}
              />
              <button
                type="submit"
                disabled={isSending || !draft.trim() || !enabled}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-editor-border-subtle bg-[#d70032] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#b00025] disabled:cursor-not-allowed disabled:opacity-50"
                title="Отправить"
              >
                <SendHorizontal size={16} />
              </button>
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