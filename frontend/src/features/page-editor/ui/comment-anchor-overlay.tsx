import type { Editor } from '@tiptap/core';
import { MessageSquare } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { CommentThreadView } from '../model/use-page-comments';

type CommentAnchorOverlayProps = {
  editor: Editor | null;
  threads: CommentThreadView[];
  activeThreadId: string | null;
  onOpenThread: (threadId: string) => void;
};

type AnchorBadge = {
  threadId: string;
  top: number;
  left: number;
  count: number;
};

function getEditorDom(editor: Editor): HTMLElement | null {
  try {
    if (editor.isDestroyed) {
      return null;
    }

    return editor.view.dom;
  } catch {
    return null;
  }
}

export function CommentAnchorOverlay({ editor, threads, activeThreadId, onOpenThread }: CommentAnchorOverlayProps) {
  const [badges, setBadges] = useState<AnchorBadge[]>([]);

  const recalculate = useCallback(() => {
    if (!editor) {
      setBadges([]);
      return;
    }

    const markType = editor.schema.marks.commentAnchor;
    const editorDom = getEditorDom(editor);
    const surface = editorDom?.closest<HTMLElement>('[data-page-editor-surface]');
    const surfaceRect = surface?.getBoundingClientRect();
    const editorRect = editorDom?.getBoundingClientRect();

    if (!markType || !surfaceRect || !editorRect) {
      setBadges([]);
      return;
    }

    const threadMap = new Map(threads.map((thread) => [thread.id, thread]));
    const seen = new Set<string>();
    const nextBadges: AnchorBadge[] = [];

    editor.state.doc.descendants((node, pos) => {
      if (!node.isText) {
        return;
      }

      const mark = node.marks.find((item) => item.type === markType);
      const threadId = mark?.attrs.threadId as string | undefined;

      if (!threadId || seen.has(threadId)) {
        return;
      }

      seen.add(threadId);

      try {
        const coords = editor.view.coordsAtPos(pos);
        const thread = threadMap.get(threadId);
        nextBadges.push({
          threadId,
          top: Math.max(0, coords.top - surfaceRect.top - 2),
          left: Math.min(surfaceRect.width - 44, editorRect.right - surfaceRect.left + 10),
          count: thread?.messages.length ?? 0,
        });
      } catch {
        // Ignore anchors outside the current viewport/layout pass.
      }
    });

    setBadges(nextBadges);
  }, [editor, threads]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const frameId = window.requestAnimationFrame(recalculate);
    editor.on('transaction', recalculate);
    window.addEventListener('resize', recalculate);
    window.addEventListener('scroll', recalculate, true);

    return () => {
      window.cancelAnimationFrame(frameId);
      editor.off('transaction', recalculate);
      window.removeEventListener('resize', recalculate);
      window.removeEventListener('scroll', recalculate, true);
    };
  }, [editor, recalculate]);

  if (!editor || badges.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {badges.map((badge) => (
        <button
          key={badge.threadId}
          type="button"
          onClick={() => onOpenThread(badge.threadId)}
          className={[
            'pointer-events-auto absolute inline-flex h-[22px] min-w-[42px] items-center justify-center gap-1 rounded bg-[#d70032] px-1.5 text-[10px] font-semibold text-white shadow-sm transition-colors hover:bg-[#d732df]',
            activeThreadId === badge.threadId ? 'ring-2 ring-[#d8d2fc]' : '',
          ].join(' ')}
          style={{ top: badge.top, left: badge.left }}
          aria-label="Открыть комментарий"
        >
          <MessageSquare size={12} />
          {badge.count || '...'}
        </button>
      ))}
    </div>
  );
}
