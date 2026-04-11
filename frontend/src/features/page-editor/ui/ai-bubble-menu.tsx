import type { Editor } from '@tiptap/core';
import { Sparkles, Scissors } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { wikiliveApi } from '../../../shared/api/wikilive';

type AIBubbleMenuProps = {
  editor: Editor | null;
  pageTitle?: string;
};

function getEditorMarkdown(editor: Editor): string {
  const markdownStorage = (editor.storage as { markdown?: { getMarkdown?: () => string } }).markdown;

  if (markdownStorage?.getMarkdown) {
    return markdownStorage.getMarkdown();
  }

  return editor.getText();
}

export function AIBubbleMenu({ editor, pageTitle }: AIBubbleMenuProps) {
  const [visible, setVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    if (!editor) {
      return;
    }

    const { from, to, empty } = editor.state.selection;

    if (empty) {
      setVisible(false);
      setErrorMessage('');
      return;
    }

    const selectedText = editor.state.doc.textBetween(from, to, ' ').trim();
    if (!selectedText) {
      setVisible(false);
      return;
    }

    const start = editor.view.coordsAtPos(from);
    const end = editor.view.coordsAtPos(to);
    setPosition({
      top: Math.min(start.top, end.top),
      left: (start.left + end.left) / 2,
    });
    setVisible(true);
  }, [editor]);

  const runTransform = useCallback(async (transformation: 'professional' | 'shorten') => {
    if (!editor) {
      return;
    }

    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, ' ').trim();

    if (!text) {
      return;
    }

    try {
      setIsLoading(true);
      setErrorMessage('');

      const markdown = getEditorMarkdown(editor);
      const response = await wikiliveApi.aiTransform({
        text,
        transformation,
        pageTitle,
        pageSnapshot: {
          markdown,
        },
      });

      editor.chain().focus().insertContentAt({ from, to }, response.text).run();
      setVisible(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'AI transform failed');
    } finally {
      setIsLoading(false);
    }
  }, [editor, pageTitle]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    updatePosition();
    editor.on('selectionUpdate', updatePosition);
    editor.on('transaction', updatePosition);

    return () => {
      editor.off('selectionUpdate', updatePosition);
      editor.off('transaction', updatePosition);
    };
  }, [editor, updatePosition]);

  if (!editor || !visible) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: position.top - 46,
        left: position.left,
        transform: 'translateX(-50%)',
        zIndex: 60,
      }}
      className="rounded-lg border border-editor-border-control bg-white p-1 shadow-lg"
      role="toolbar"
      aria-label="AI трансформации"
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => void runTransform('professional')}
          disabled={isLoading}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[#3f3f46] hover:bg-[#edf0f5] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles size={14} />
          Улучшить стиль
        </button>
        <button
          type="button"
          onClick={() => void runTransform('shorten')}
          disabled={isLoading}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[#3f3f46] hover:bg-[#edf0f5] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Scissors size={14} />
          Сократить
        </button>
      </div>
      {errorMessage ? <p className="mt-1 px-1 text-[11px] text-[#b00025]">{errorMessage}</p> : null}
    </div>
  );
}
