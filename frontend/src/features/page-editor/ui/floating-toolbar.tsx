import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { Code2, List, ListOrdered, ListChecks, Pencil } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { handleListAction } from '../model/list-actions';
import { menuBarStateSelector } from '../model/menu-state';
import { wikiliveApi } from '../../../shared/api/wikilive';

import B from '../../../app/images/B.svg';
import Tk from '../../../app/images/Tk.svg';
import T1 from '../../../app/images/T1.svg';
import U from '../../../app/images/U.svg';
import H1 from '../../../app/images/H1.svg';
import H2 from '../../../app/images/H2.svg';
import H3 from '../../../app/images/H3.svg';

const redFilter = 'brightness(0) saturate(100%) invert(36%) sepia(94%) saturate(2665%) hue-rotate(346deg) brightness(101%) contrast(97%)';

type FloatingToolbarProps = {
  editor: Editor | null;
  onOpenLinkModal: () => void;
  pageTitle?: string;
};

type ToolbarButtonProps = {
  icon: React.ReactNode;
  pressed?: boolean;
  disabled?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  onClick: () => void;
  'aria-label'?: string;
};

function ToolbarButton({
  icon,
  pressed = false,
  disabled = false,
  isFirst = false,
  isLast = false,
  onClick,
  'aria-label': ariaLabel,
}: ToolbarButtonProps) {
  const radiusClasses = isFirst && isLast
    ? 'rounded'
    : isFirst
      ? 'rounded-l'
      : isLast
        ? 'rounded-r'
        : 'rounded-none';

  const marginClass = !isFirst ? '-ml-px' : '';

  const className = [
    'inline-flex shrink-0 items-center justify-center transition-colors relative',
    'h-7 min-w-7 px-1',
    marginClass,
    radiusClasses,
    'border border-editor-border-control bg-white text-[rgba(80,87,98,1)] hover:bg-[#e8ebf1]',
    pressed ? 'border-red-500 !border-opacity-100 bg-[#f5f7fa]' : '',
    disabled ? 'cursor-not-allowed opacity-45 hover:bg-white' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={className}
      aria-label={ariaLabel}
    >
      {icon}
    </button>
  );
}

export function FloatingToolbar({ editor, onOpenLinkModal, pageTitle }: FloatingToolbarProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [isAiLoading, setIsAiLoading] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const state = useEditorState({
    editor,
    selector: menuBarStateSelector,
  });

  const updatePosition = useCallback(() => {
    if (!editor) return;

    const editorState = editor.state;
    const { from, to, empty } = editorState.selection;

    if (empty) {
      setVisible(false);
      return;
    }

    let hasTextContent = false;
    editorState.doc.nodesBetween(from, to, (node) => {
      if (node.isText) {
        hasTextContent = true;
      }
    });

    if (!hasTextContent) {
      setVisible(false);
      return;
    }

    const view = editor.view;
    const start = view.coordsAtPos(from);
    const end = view.coordsAtPos(to);

    const top = Math.min(start.top, end.top);
    const left = (start.left + end.left) / 2;

    setPosition({ top, left });
    setVisible(true);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;

    updatePosition();

    editor.on('transaction', updatePosition);

    return () => {
      editor.off('transaction', updatePosition);
    };
  }, [editor, updatePosition]);

  if (!editor || !state || !visible) {
    return null;
  }

  const getEditorMarkdown = () => {
    const markdownStorage = (editor.storage as { markdown?: { getMarkdown?: () => string } }).markdown;

    if (markdownStorage?.getMarkdown) {
      return markdownStorage.getMarkdown();
    }

    return editor.getText();
  };

  const runAiTransform = async (transformation: 'professional' | 'shorten') => {
    const { from, to, empty } = editor.state.selection;
    if (empty) {
      return;
    }

    const selectedText = editor.state.doc.textBetween(from, to, ' ').trim();
    if (!selectedText) {
      return;
    }

    try {
      setIsAiLoading(true);
      const response = await wikiliveApi.aiTransform({
        text: selectedText,
        transformation,
        pageTitle,
        pageSnapshot: {
          markdown: getEditorMarkdown(),
        },
      });

      editor.chain().focus().insertContentAt({ from, to }, response.text).run();
    } catch {
      // Keep toolbar silent on failure; request-level errors are already visible elsewhere.
    } finally {
      setIsAiLoading(false);
    }
  };

  const style: React.CSSProperties = {
    position: 'fixed',
    top: position.top - 40,
    left: position.left,
    transform: 'translateX(-50%)',
    zIndex: 50,
  };

  return (
    <div
      ref={toolbarRef}
      style={style}
      className="flex items-center gap-0 rounded-md border border-editor-border-control bg-white p-0.5 shadow-lg"
      role="toolbar"
      aria-label="Плавающая панель форматирования"
    >
      <ToolbarButton
        icon={
          <img
            src={B}
            alt="Полужирное начертание"
            className="h-3.5 w-3.5"
            style={state.isBold ? { filter: redFilter } : {}}
          />
        }
        onClick={() => editor.chain().focus().toggleBold().run()}
        pressed={state.isBold}
        disabled={!state.canBold}
        isFirst={true}
        isLast={false}
        aria-label="Полужирный (Ctrl+B)"
      />
      <ToolbarButton
        icon={
          <img
            src={Tk}
            alt="Курсивное начертание"
            className="h-3.5 w-3.5"
            style={state.isItalic ? { filter: redFilter } : {}}
          />
        }
        onClick={() => editor.chain().focus().toggleItalic().run()}
        pressed={state.isItalic}
        disabled={!state.canItalic}
        isFirst={false}
        isLast={false}
        aria-label="Курсив (Ctrl+I)"
      />
      <ToolbarButton
        icon={
          <img
            src={T1}
            alt="Зачёркнутый текст"
            className="h-3.5 w-3.5"
            style={state.isStrike ? { filter: redFilter } : {}}
          />
        }
        onClick={() => editor.chain().focus().toggleStrike().run()}
        pressed={state.isStrike}
        disabled={!state.canStrike}
        isFirst={false}
        isLast={false}
        aria-label="Зачёркнутый"
      />
      <ToolbarButton
        icon={
          <img
            src={U}
            alt="Подчёркнутый текст"
            className="h-3.5 w-3.5"
            style={state.isUnderline ? { filter: redFilter } : {}}
          />
        }
        onClick={() => editor.chain().focus().toggleUnderline?.().run()}
        pressed={state.isUnderline}
        disabled={!state.canUnderline}
        isFirst={false}
        isLast={false}
        aria-label="Подчёркнутый (Ctrl+U)"
      />
      <ToolbarButton
        icon={
          <Code2 className="h-3.5 w-3.5" style={{ color: 'rgba(80, 87, 98, 1)' }} />
        }
        onClick={() => editor.chain().focus().toggleCode().run()}
        pressed={state.isCode}
        disabled={!state.canCode}
        isFirst={false}
        isLast={true}
        aria-label="Код"
      />

      <span className="mx-0.5 h-4 w-px shrink-0 bg-editor-border-subtle" aria-hidden="true" />

      <ToolbarButton
        icon={
          <img
            src={H1}
            alt="Заголовок 1 уровня"
            className="h-3.5 w-3.5"
            style={state.isHeading1 ? { filter: redFilter } : {}}
          />
        }
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        pressed={state.isHeading1}
        isFirst={true}
        isLast={false}
        aria-label="Заголовок 1"
      />
      <ToolbarButton
        icon={
          <img
            src={H2}
            alt="Заголовок 2 уровня"
            className="h-3.5 w-3.5"
            style={state.isHeading2 ? { filter: redFilter } : {}}
          />
        }
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        pressed={state.isHeading2}
        isFirst={false}
        isLast={false}
        aria-label="Заголовок 2"
      />
      <ToolbarButton
        icon={
          <img
            src={H3}
            alt="Заголовок 3 уровня"
            className="h-3.5 w-3.5"
            style={state.isHeading3 ? { filter: redFilter } : {}}
          />
        }
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        pressed={state.isHeading3}
        isFirst={false}
        isLast={true}
        aria-label="Заголовок 3"
      />

      <span className="mx-0.5 h-4 w-px shrink-0 bg-editor-border-subtle" aria-hidden="true" />

      <ToolbarButton
        icon={<List className="h-3.5 w-3.5" style={{ color: 'rgba(80, 87, 98, 1)' }} />}
        onClick={() => handleListAction(editor, 'bulletList')}
        pressed={state.isBulletList}
        disabled={!state.canBulletList}
        isFirst={true}
        isLast={false}
        aria-label="Маркированный список"
      />
      <ToolbarButton
        icon={<ListOrdered className="h-3.5 w-3.5" style={{ color: 'rgba(80, 87, 98, 1)' }} />}
        onClick={() => handleListAction(editor, 'orderedList')}
        pressed={state.isOrderedList}
        disabled={!state.canOrderedList}
        isFirst={false}
        isLast={false}
        aria-label="Нумерованный список"
      />
      <ToolbarButton
        icon={<ListChecks className="h-3.5 w-3.5" style={{ color: 'rgba(80, 87, 98, 1)' }} />}
        onClick={() => handleListAction(editor, 'taskList')}
        pressed={state.isTaskList}
        disabled={!state.canTaskList}
        isFirst={false}
        isLast={true}
        aria-label="Чеклист"
      />

      <span className="mx-0.5 h-4 w-px shrink-0 bg-editor-border-subtle" aria-hidden="true" />

      <button
        type="button"
        onClick={() => {
          if (state.isLink && state.canUnsetLink) {
            editor.chain().focus().unsetLink().run();
          } else {
            onOpenLinkModal();
          }
        }}
        className={[
          'inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded text-xs font-semibold transition-colors',
          'border border-editor-border-control bg-transparent text-[rgba(80,87,98,1)] hover:bg-[#e8ebf1]',
          state.isLink ? 'border-red-500 !border-opacity-100 bg-[#f5f7fa]' : '',
        ].join(' ')}
        aria-label={state.isLink ? 'Удалить ссылку' : 'Вставить ссылку'}
      >
        @
      </button>

      <span className="mx-0.5 h-4 w-px shrink-0 bg-editor-border-subtle" aria-hidden="true" />

      <ToolbarButton
        icon={<Pencil className="h-3.5 w-3.5" style={{ color: 'rgba(80, 87, 98, 1)' }} />}
        onClick={() => editor.chain().focus().insertCanvasBlock().run()}
        isFirst={true}
        isLast={true}
        aria-label="Вставить блок для рисования"
      />

      <span className="mx-0.5 h-4 w-px shrink-0 bg-editor-border-subtle" aria-hidden="true" />

      <ToolbarButton
        icon={<span className="px-1 text-[11px] font-semibold">Улучшить</span>}
        onClick={() => void runAiTransform('professional')}
        disabled={isAiLoading}
        isFirst={true}
        isLast={false}
        aria-label="Улучшить стиль"
      />
      <ToolbarButton
        icon={<span className="px-1 text-[11px] font-semibold">Сократить</span>}
        onClick={() => void runAiTransform('shorten')}
        disabled={isAiLoading}
        isFirst={false}
        isLast={true}
        aria-label="Сократить текст"
      />
    </div>
  );
}
