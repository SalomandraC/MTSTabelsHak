import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Content, Editor } from '@tiptap/core';
import {
  type PageHistoryCheckpoint,
  type PageHistoryItem,
  wikiliveApi,
} from '../../../shared/api/wikilive';

type UsePageHistoryOptions = {
  pageId: string | null;
  editor: Editor | null;
  enabled: boolean;
  getDocumentStateValue: (() => string | null) | null;
  onRestored: () => Promise<void>;
};

export function usePageHistory({
  pageId,
  editor,
  enabled,
  getDocumentStateValue,
  onRestored,
}: UsePageHistoryOptions) {
  const [items, setItems] = useState<PageHistoryItem[]>([]);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<PageHistoryCheckpoint | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingCheckpoint, setIsLoadingCheckpoint] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedCheckpointId) ?? null,
    [items, selectedCheckpointId],
  );

  const refreshHistory = useCallback(async () => {
    if (!pageId || !enabled) {
      setItems([]);
      setSelectedCheckpointId(null);
      setSelectedCheckpoint(null);
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const response = await wikiliveApi.listPageHistory(pageId);
      setItems(response.items);
      setSelectedCheckpointId((current) => {
        if (current && response.items.some((item) => item.id === current)) {
          return current;
        }

        return response.items[0]?.id ?? null;
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось загрузить историю документа');
    } finally {
      setIsLoading(false);
    }
  }, [enabled, pageId]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    void refreshHistory();
  }, [enabled, refreshHistory]);

  const openCheckpoint = useCallback(async (checkpointId: string) => {
    if (!pageId) {
      return null;
    }

    setSelectedCheckpointId(checkpointId);
    setIsLoadingCheckpoint(true);
    setErrorMessage('');

    try {
      const checkpoint = await wikiliveApi.getPageHistoryCheckpoint(pageId, checkpointId);
      setSelectedCheckpoint(checkpoint);
      return checkpoint;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось открыть версию');
      return null;
    } finally {
      setIsLoadingCheckpoint(false);
    }
  }, [pageId]);

  useEffect(() => {
    if (!enabled || !selectedCheckpointId) {
      setSelectedCheckpoint(null);
      return;
    }

    if (selectedCheckpoint?.checkpoint.id === selectedCheckpointId) {
      return;
    }

    void openCheckpoint(selectedCheckpointId);
  }, [enabled, openCheckpoint, selectedCheckpoint?.checkpoint.id, selectedCheckpointId]);

  const restoreCheckpoint = useCallback(async () => {
    if (!pageId || !editor || !selectedCheckpoint || !getDocumentStateValue) {
      setErrorMessage('Редактор еще не готов к восстановлению версии');
      return;
    }

    const beforeRestoreValue = getDocumentStateValue();

    if (!beforeRestoreValue) {
      setErrorMessage('Не удалось сохранить текущее состояние перед восстановлением');
      return;
    }

    setIsRestoring(true);
    setErrorMessage('');

    try {
      await wikiliveApi.createCheckpoint(pageId, beforeRestoreValue, 'manual');
      editor.commands.setContent(selectedCheckpoint.document as Content);

      const restoredValue = getDocumentStateValue();
      if (!restoredValue) {
        throw new Error('Не удалось собрать восстановленное состояние документа');
      }

      await wikiliveApi.createCheckpoint(pageId, restoredValue, 'restore', selectedCheckpoint.checkpoint.id);
      await onRestored();
      await refreshHistory();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Не удалось восстановить версию');
    } finally {
      setIsRestoring(false);
    }
  }, [editor, getDocumentStateValue, onRestored, pageId, refreshHistory, selectedCheckpoint]);

  return {
    items,
    selectedItem,
    selectedCheckpoint,
    selectedCheckpointId,
    isLoading,
    isLoadingCheckpoint,
    isRestoring,
    errorMessage,
    refreshHistory,
    openCheckpoint,
    restoreCheckpoint,
  };
}
