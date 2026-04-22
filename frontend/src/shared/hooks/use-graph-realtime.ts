import { useEffect, useRef, useCallback } from 'react';
import { wikiliveApi } from '../api/wikilive';

export type GraphRealtimeEvent =
  | {
      type: 'links_updated';
      sourcePageId: string;
      edges: Array<{
        targetPageId: string;
        mentionCount: number;
      }>;
    }
  | {
      type: 'page_added';
      pageId: string;
      title: string;
      fileSizeBytes?: number;
    }
  | {
      type: 'page_removed';
      pageId: string;
    }
  | {
      type: 'full_refresh_required';
    };

type GraphRealtimeHandler = (event: GraphRealtimeEvent) => void;

export function useGraphRealtime(spaceId: string | null | undefined, onGraphChange: GraphRealtimeHandler) {
  const handlersRef = useRef<Set<GraphRealtimeHandler>>(new Set());

  useEffect(() => {
    handlersRef.current.clear();
    handlersRef.current.add(onGraphChange);
  }, [onGraphChange]);

  useEffect(() => {
    if (!spaceId) return;

    const channel = wikiliveApi.openWorkspaceRealtime(spaceId, {
      onMessage: (event) => {
        if (event.type === 'page_updated') {
          const pageId = event.pageId;
          wikiliveApi
            .getOutgoingLinks(pageId)
            .then((response) => {
              handlersRef.current.forEach((h) =>
                h({
                  type: 'links_updated',
                  sourcePageId: pageId,
                  edges: response.items.map((link) => ({ targetPageId: link.targetPageId, mentionCount: link.mentionCount })),
                }),
              );
            })
            .catch(() => {
              handlersRef.current.forEach((h) => h({ type: 'full_refresh_required' }));
            });
        }
      },
      onError: () => {
        handlersRef.current.forEach((h) => h({ type: 'full_refresh_required' }));
      },
    });

    return () => channel.close();
  }, [spaceId]);

  const triggerFullRefresh = useCallback(() => {
    handlersRef.current.forEach((h) => h({ type: 'full_refresh_required' }));
  }, []);

  return { triggerFullRefresh };
}
