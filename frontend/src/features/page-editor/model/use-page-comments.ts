import type { Editor } from '@tiptap/core';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  type PageCommentThread,
  wikiliveApi,
} from '../../../shared/api/wikilive';

export type CommentThreadView = PageCommentThread & {
  isDraft?: boolean;
};

type UsePageCommentsOptions = {
  pageId: string | null;
  editor: Editor | null;
  enabled: boolean;
};

function createDraftThread(pageId: string, threadId: string, anchorText: string): CommentThreadView {
  const now = new Date().toISOString();

  return {
    id: threadId,
    pageId,
    anchorText,
    status: 'open',
    createdBy: '',
    createdByName: '',
    resolvedBy: null,
    resolvedAt: null,
    createdAt: now,
    updatedAt: now,
    messages: [],
    isDraft: true,
  };
}

export function usePageComments({ pageId, editor, enabled }: UsePageCommentsOptions) {
  const [threads, setThreads] = useState<PageCommentThread[]>([]);
  const [draftThread, setDraftThread] = useState<CommentThreadView | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const replaceThread = useCallback((thread: PageCommentThread) => {
    setThreads((current) => [thread, ...current.filter((item) => item.id !== thread.id)]);
  }, []);

  const refreshComments = useCallback(
    async (silent = false) => {
      if (!pageId || !enabled) {
        return;
      }

      if (!silent) {
        setIsLoading(true);
      }

      try {
        const response = await wikiliveApi.getComments(pageId, true);
        setThreads(response.items);
        setErrorMessage('');
      } catch (error) {
        if (!silent) {
          setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить комментарии');
        }
      } finally {
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    [enabled, pageId],
  );

  useEffect(() => {
    setThreads([]);
    setDraftThread(null);
    setActiveThreadId(null);
    setErrorMessage('');
    setIsLoading(false);
  }, [pageId, enabled]);

  useEffect(() => {
    if (!pageId || !enabled) {
      return;
    }

    void refreshComments();

    const intervalId = window.setInterval(() => {
      void refreshComments(true);
    }, 2500);

    const handleFocus = () => {
      void refreshComments(true);
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [enabled, pageId, refreshComments]);

  const activeThread = useMemo<CommentThreadView | null>(() => {
    if (!activeThreadId) {
      return null;
    }

    if (draftThread?.id === activeThreadId) {
      return draftThread;
    }

    return threads.find((thread) => thread.id === activeThreadId) ?? null;
  }, [activeThreadId, draftThread, threads]);

  const openThreads = useMemo(() => threads.filter((thread) => thread.status === 'open'), [threads]);

  const startThreadFromSelection = useCallback(
    (sourceEditor?: Editor | null) => {
      const targetEditor = sourceEditor ?? editor;
      if (!enabled) {
        setErrorMessage('Комментарии отключены в текущем рабочем пространстве');
        return;
      }

      if (!pageId || !targetEditor) {
        setErrorMessage('Сначала откройте страницу');
        return;
      }

      const { from, to, empty } = targetEditor.state.selection;
      const anchorText = targetEditor.state.doc.textBetween(from, to, ' ').trim();

      if (empty || !anchorText) {
        setErrorMessage('Выделите фрагмент текста, чтобы оставить комментарий');
        return;
      }

      const threadId = crypto.randomUUID();
      if (draftThread) {
        targetEditor.commands.removeCommentAnchor(draftThread.id);
      }

      const applied = targetEditor.chain().focus().setCommentAnchor({ threadId }).run();

      if (!applied) {
        setErrorMessage('Не удалось привязать комментарий к выделению');
        return;
      }

      const draft = createDraftThread(pageId, threadId, anchorText);
      setDraftThread(draft);
      setActiveThreadId(threadId);
      setErrorMessage('');
    },
    [draftThread, editor, enabled, pageId],
  );

  const openThread = useCallback(
    (threadId: string) => {
      if (!enabled) {
        return;
      }

      setActiveThreadId(threadId);
      setErrorMessage('');
    },
    [enabled],
  );

  const closePanel = useCallback(() => {
    if (draftThread && editor) {
      editor.commands.removeCommentAnchor(draftThread.id);
    }

    setDraftThread(null);
    setActiveThreadId(null);
    setErrorMessage('');
  }, [draftThread, editor]);

  const submitMessage = useCallback(
    async (body: string) => {
      const trimmedBody = body.trim();
      if (!trimmedBody || !pageId || !activeThreadId) {
        return;
      }

      try {
        setIsLoading(true);

        if (draftThread?.id === activeThreadId) {
          const response = await wikiliveApi.createCommentThread(pageId, {
            threadId: draftThread.id,
            anchorText: draftThread.anchorText,
            body: trimmedBody,
          });
          setDraftThread(null);
          replaceThread(response.thread);
          setActiveThreadId(response.thread.id);
        } else {
          const response = await wikiliveApi.addCommentMessage(pageId, activeThreadId, { body: trimmedBody });
          replaceThread(response.thread);
        }

        setErrorMessage('');
        void refreshComments(true);
      } catch (error) {
        if (draftThread?.id === activeThreadId) {
          editor?.commands.removeCommentAnchor(draftThread.id);
          setDraftThread(null);
          setActiveThreadId(null);
        }

        setErrorMessage(error instanceof Error ? error.message : 'Не удалось сохранить комментарий');
      } finally {
        setIsLoading(false);
      }
    },
    [activeThreadId, draftThread, editor, pageId, refreshComments, replaceThread],
  );

  const editMessage = useCallback(
    async (threadId: string, messageId: string, body: string) => {
      if (!pageId) {
        return;
      }

      try {
        const response = await wikiliveApi.updateCommentMessage(pageId, threadId, messageId, { body: body.trim() });
        replaceThread(response.thread);
        setErrorMessage('');
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Не удалось изменить комментарий');
      }
    },
    [pageId, replaceThread],
  );

  const deleteMessage = useCallback(
    async (threadId: string, messageId: string) => {
      if (!pageId) {
        return;
      }

      try {
        const response = await wikiliveApi.deleteCommentMessage(pageId, threadId, messageId);
        replaceThread(response.thread);
        setErrorMessage('');
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Не удалось удалить комментарий');
      }
    },
    [pageId, replaceThread],
  );

  const resolveThread = useCallback(
    async (threadId: string) => {
      if (!pageId) {
        return;
      }

      try {
        const response = await wikiliveApi.updateCommentThread(pageId, threadId, { status: 'resolved' });
        replaceThread(response.thread);
        editor?.commands.removeCommentAnchor(threadId);
        setActiveThreadId(null);
        setErrorMessage('');
        void refreshComments(true);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Не удалось решить ветку комментариев');
      }
    },
    [editor, pageId, refreshComments, replaceThread],
  );

  return {
    threads,
    openThreads,
    activeThread,
    activeThreadId,
    isPanelOpen: Boolean(activeThreadId),
    isLoading,
    errorMessage,
    commentCount: openThreads.length,
    refreshComments,
    startThreadFromSelection,
    openThread,
    closePanel,
    submitMessage,
    editMessage,
    deleteMessage,
    resolveThread,
  };
}
