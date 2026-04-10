import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';

import { menuBarStateSelector } from '../model/menu-state';

type PageEditorToolbarProps = {
  editor: Editor | null;
};

type ToolbarButtonProps = {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

function ToolbarButton({ label, pressed = false, disabled = false, onClick }: ToolbarButtonProps) {
  const className = [
    'inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md border px-2 text-xs font-semibold transition-colors',
    'border-editor-border-control bg-editor-bg-control text-editor-icon hover:bg-[#e8ebf1] hover:text-editor-text-primary',
    pressed ? 'border-[#bac3d4] bg-[#dde6ff] text-[#23355f]' : '',
    disabled ? 'cursor-not-allowed opacity-45 hover:bg-editor-bg-control hover:text-editor-icon' : '',
  ]
    .join(' ')
    .trim();

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className}>
      {label}
    </button>
  );
}

export function PageEditorToolbar({ editor }: PageEditorToolbarProps) {
  const state =
    useEditorState({
      editor,
      selector: menuBarStateSelector,
    }) ??
    {
      isBold: false,
      canBold: false,
      isItalic: false,
      canItalic: false,
      isStrike: false,
      canStrike: false,
      isCode: false,
      canCode: false,
      canClearNodes: false,
      isParagraph: false,
      isHeading1: false,
      isHeading2: false,
      isHeading3: false,
      isBulletList: false,
      isOrderedList: false,
      isBlockquote: false,
      isCodeBlock: false,
      canUndo: false,
      canRedo: false,
    };

  if (!editor) {
    return null;
  }

  return (
    <div className="sticky top-0 z-20 border-b border-editor-border-subtle bg-editor-bg-toolbar px-2 py-2 sm:px-4">
      <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap pb-0.5">
        <ToolbarButton label="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!state.canUndo} />
        <ToolbarButton label="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!state.canRedo} />

        <span className="mx-1 h-5 w-px shrink-0 bg-editor-border-subtle" aria-hidden="true" />

        <ToolbarButton
          label="B"
          onClick={() => editor.chain().focus().toggleBold().run()}
          pressed={state.isBold}
          disabled={!state.canBold}
        />
        <ToolbarButton
          label="I"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          pressed={state.isItalic}
          disabled={!state.canItalic}
        />
        <ToolbarButton
          label="S"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          pressed={state.isStrike}
          disabled={!state.canStrike}
        />
        <ToolbarButton
          label="Code"
          onClick={() => editor.chain().focus().toggleCode().run()}
          pressed={state.isCode}
          disabled={!state.canCode}
        />

        <span className="mx-1 h-5 w-px shrink-0 bg-editor-border-subtle" aria-hidden="true" />

        <ToolbarButton label="P" onClick={() => editor.chain().focus().setParagraph().run()} pressed={state.isParagraph} />
        <ToolbarButton
          label="H1"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          pressed={state.isHeading1}
        />
        <ToolbarButton
          label="H2"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          pressed={state.isHeading2}
        />
        <ToolbarButton
          label="H3"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          pressed={state.isHeading3}
        />

        <span className="mx-1 h-5 w-px shrink-0 bg-editor-border-subtle" aria-hidden="true" />

        <ToolbarButton
          label="UL"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          pressed={state.isBulletList}
        />
        <ToolbarButton
          label="OL"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          pressed={state.isOrderedList}
        />
        <ToolbarButton
          label="Quote"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          pressed={state.isBlockquote}
        />
        <ToolbarButton
          label="Block"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          pressed={state.isCodeBlock}
        />

        <span className="mx-1 h-5 w-px shrink-0 bg-editor-border-subtle" aria-hidden="true" />

        <ToolbarButton
          label="Clear"
          onClick={() => editor.chain().focus().clearNodes().run()}
          disabled={!state.canClearNodes}
        />
      </div>
    </div>
  );
}
