import { useCallback } from 'react';

import type { AiChatResponse } from '../../../../shared/api/wikilive';

type AiTableRefreshContext = {
  datasheetId?: string | null;
  viewId?: string | null;
};

type RefreshRequestDetail = AiTableRefreshContext & {
  reason?: string;
};

function dispatchRefresh(detail: RefreshRequestDetail = {}) {
  window.dispatchEvent(new CustomEvent('wikilive:ai-table-refresh-request', { detail }));
}

export function useAiTableContext() {
  const handleAiChatResponse = useCallback((response: AiChatResponse, context: AiTableRefreshContext = {}) => {
    if (!response.needsRefresh) {
      return;
    }

    dispatchRefresh({
      datasheetId: context.datasheetId ?? null,
      viewId: context.viewId ?? null,
      reason: 'ai-chat-needs-refresh',
    });
  }, []);

  const refreshTable = useCallback((context: AiTableRefreshContext = {}) => {
    dispatchRefresh({
      datasheetId: context.datasheetId ?? null,
      viewId: context.viewId ?? null,
      reason: 'manual-refresh-request',
    });
  }, []);

  return {
    handleAiChatResponse,
    refreshTable,
  };
}

export function requestAiTableRefresh(context: AiTableRefreshContext = {}) {
  dispatchRefresh({
    datasheetId: context.datasheetId ?? null,
    viewId: context.viewId ?? null,
    reason: 'manual-refresh-request',
  });
}