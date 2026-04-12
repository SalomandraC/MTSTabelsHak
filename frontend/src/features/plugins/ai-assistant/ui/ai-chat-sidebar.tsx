import { Send } from 'lucide-react';
import { useState } from 'react';
import type { Editor } from '@tiptap/core';

import { wikiliveApi } from '../../../../shared/api/wikilive';
import { getEditorMarkdown } from '../model/editor-markdown';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

export function AiChatSidebar({
  pageId,
  pageTitle,
  editor,
  enabled,
}: {
  pageId: string | null;
  pageTitle?: string;
  editor: Editor | null;
  enabled: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!enabled) {
    return (
      <section>
        <h3 className="text-sm font-semibold">ИИ-ассистент</h3>
        <div className="mt-2 rounded-2xl border border-dashed border-editor-border-subtle bg-[#fafbfc] px-4 py-5 text-sm text-editor-text-tertiary">
          Модуль ИИ отключен. Включите его в каталоге плагинов для использования ассистента.
        </div>
      </section>
    );
  }

  const handleSend = async () => {
    const trimmed = question.trim();
    if (!trimmed || isSending) {
      return;
    }

    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: trimmed }]);
    setQuestion('');
    setErrorMessage('');
    setIsSending(true);

    try {
      const response = await wikiliveApi.aiChat({
        question: trimmed,
        pageId: pageId ?? undefined,
        pageTitle,
        pageSnapshot: {
          markdown: getEditorMarkdown(editor),
        },
      });

      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: response.answer }]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось получить ответ ИИ');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section>
      <h3 className="text-sm font-semibold">ИИ-ассистент</h3>
      <div className="mt-2 space-y-2">
        <div className="max-h-52 space-y-2 overflow-y-auto rounded-lg border border-editor-border-subtle bg-[#fafbfd] p-2">
          {messages.length === 0 ? <p className="text-xs text-editor-text-tertiary">Задайте вопрос по текущей странице</p> : null}
          {messages.map((message) => (
            <div
              key={message.id}
              className={[
                'rounded-md px-2 py-1.5 text-xs',
                message.role === 'user' ? 'bg-[#eef3ff] text-[#1f2f55]' : 'border border-[#e8ebf2] bg-white text-[#2f3136]',
              ].join(' ')}
            >
              <p className="mb-1 font-semibold">{message.role === 'user' ? 'Вы' : 'ИИ'}</p>
              <p className="whitespace-pre-wrap">{message.text}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Спросить ИИ про страницу"
            className="h-9 w-full rounded-md border border-editor-border-subtle bg-white px-3 text-sm outline-none focus:border-[#5586ff]"
            disabled={isSending}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={isSending || !question.trim()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-editor-border-subtle bg-white text-editor-text-primary hover:bg-editor-bg-control disabled:cursor-not-allowed disabled:opacity-50"
            title="Отправить вопрос"
          >
            <Send size={14} />
          </button>
        </div>
        {errorMessage ? <p className="text-xs text-[#b00025]">{errorMessage}</p> : null}
      </div>
    </section>
  );
}
