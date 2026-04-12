import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Pencil, Send, Trash2, X } from 'lucide-react';

import { getCurrentUser, type PageCommentMessage } from '../../../shared/api/wikilive';
import type { CommentThreadView } from '../model/use-page-comments';

type CommentsPanelProps = {
  activeThread: CommentThreadView | null;
  activeThreadId: string | null;
  isLoading: boolean;
  errorMessage: string;
  canComment?: boolean;
  onRetry: () => void;
  onClose: () => void;
  onSubmitMessage: (body: string) => Promise<void>;
  onEditMessage: (threadId: string, messageId: string, body: string) => Promise<void>;
  onDeleteMessage: (threadId: string, messageId: string) => Promise<void>;
  onResolveThread: (threadId: string) => Promise<void>;
};

function formatCommentDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getInitials(name: string) {
  return (name.trim().slice(0, 1) || '?').toUpperCase();
}

function CommentMessageItem({
  message,
  canEdit,
  onEdit,
  onDelete,
}: {
  message: PageCommentMessage;
  canEdit: boolean;
  onEdit: (body: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);

  useEffect(() => {
    setDraft(message.body);
  }, [message.body]);

  return (
    <article className="group px-6 py-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f0f1f3] font-semibold text-[#1d2023]">
            {getInitials(message.createdByName)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-[#1d2023]">{message.createdByName}</p>
            <p className="text-xs text-[#969fa8]">{formatCommentDate(message.createdAt)}</p>
          </div>
        </div>
        {canEdit ? (
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[#505762] hover:bg-[#f0f1f3]"
              aria-label="Редактировать комментарий"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={() => void onDelete()}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[#b00025] hover:bg-[#fff1f3]"
              aria-label="Удалить комментарий"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ) : null}
      </div>
      <div className="mt-2 pl-[52px]">
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              title="Редактирование комментария"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="min-h-20 w-full resize-none rounded-md border border-editor-border-control bg-white px-3 py-2 text-sm outline-none focus:border-[#907ff0]"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void onEdit(draft).then(() => setIsEditing(false));
                }}
                disabled={!draft.trim()}
                className="h-8 rounded-md bg-[#907ff0] px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Сохранить
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(message.body);
                  setIsEditing(false);
                }}
                className="h-8 rounded-md px-3 text-xs font-semibold text-[#505762] hover:bg-[#f0f1f3]"
              >
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap leading-5 text-[#1d2023]">{message.body}</p>
        )}
      </div>
    </article>
  );
}

export function CommentsPanel({
  activeThread,
  activeThreadId,
  isLoading,
  errorMessage,
  canComment = true,
  onRetry,
  onClose,
  onSubmitMessage,
  onEditMessage,
  onDeleteMessage,
  onResolveThread,
}: CommentsPanelProps) {
  const [body, setBody] = useState('');
  const currentUserId = getCurrentUser()?.userId;
  const title = activeThread?.isDraft ? 'Новый комментарий' : 'Комментарии';
  const canResolve = Boolean(canComment && activeThread && !activeThread.isDraft && activeThread.status === 'open');

  useEffect(() => {
    setBody('');
  }, [activeThread?.id]);

  const content = useMemo(() => {
    const messages = activeThread?.messages ?? [];

    if (isLoading && !activeThread) {
      return (
        <div className="flex flex-1 items-center justify-center text-[#969fa8]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Загружаем комментарии
        </div>
      );
    }

    if (errorMessage && !activeThread) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center px-10 text-center text-sm text-[#969fa8]">
          <p className="whitespace-pre-line">Не удалось загрузить комментарии.{"\n"}Попробуйте еще раз</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 h-10 rounded-md bg-[#907ff0] px-4 text-sm font-semibold text-white"
          >
            Попробовать еще раз
          </button>
        </div>
      );
    }

    if (activeThreadId && !activeThread) {
      return (
        <div className="flex flex-1 items-center justify-center px-8 text-center text-sm text-[#969fa8]">
          Ветка комментариев синхронизируется...
        </div>
      );
    }

    if (!activeThread || messages.length === 0) {
      return <div className="flex flex-1 items-center justify-center text-sm text-[#969fa8]">Нет комментариев</div>;
    }

    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        {messages.map((message) => (
          <CommentMessageItem
            key={message.id}
            message={message}
            canEdit={message.createdBy === currentUserId}
            onEdit={(nextBody) => onEditMessage(activeThread.id, message.id, nextBody)}
            onDelete={() => onDeleteMessage(activeThread.id, message.id)}
          />
        ))}
      </div>
    );
  }, [activeThread, activeThreadId, currentUserId, errorMessage, isLoading, onDeleteMessage, onEditMessage, onRetry]);

  return (
    <div className="min-h-0 flex flex-1 flex-col overflow-hidden bg-white text-editor-text-primary">
      <header className="border-b border-editor-border-subtle px-6 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[#1d2023]">{title}</h2>
            {activeThread?.anchorText ? (
              <p className="mt-1 truncate text-sm text-[#969fa8]">{activeThread.anchorText}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {canResolve ? (
              <button
                type="button"
                onClick={() => void onResolveThread(activeThread!.id)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-[#30a46c] hover:bg-[#edf8f1]"
                aria-label="Решить вопрос"
                title="Решить вопрос"
              >
                <Check size={16} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[#505762] hover:bg-[#f0f1f3]"
              aria-label="Закрыть комментарии"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </header>

      {errorMessage && activeThread ? (
        <div className="border-b border-[#ffd2d9] bg-[#fff1f3] px-6 py-2 text-xs text-[#b00025]">{errorMessage}</div>
      ) : null}

      {content}

      {canComment && activeThread && activeThread.status === 'open' ? (
        <form
          className="border-t border-editor-border-subtle p-2"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = body.trim();

            if (!trimmed) {
              return;
            }

            void onSubmitMessage(trimmed).then(() => setBody(''));
          }}
        >
          <label className="sr-only" htmlFor="comment-reply-input">
            Комментарий
          </label>
          <div className="flex items-end gap-2 rounded-md border border-editor-border-control bg-white px-3 py-2 focus-within:border-[#907ff0]">
            <textarea
              id="comment-reply-input"
              title="Комментарий"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={activeThread.isDraft ? 'Напишите комментарий' : 'Ответить'}
              className="max-h-32 min-h-9 flex-1 resize-none border-0 bg-transparent text-sm leading-5 outline-none"
              rows={1}
            />
            <button
              type="submit"
              disabled={!body.trim() || isLoading}
              className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#907ff0] text-white disabled:cursor-not-allowed disabled:opacity-45"
              aria-label="Отправить комментарий"
            >
              <Send size={15} />
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
