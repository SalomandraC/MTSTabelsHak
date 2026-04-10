import type { Editor } from '@tiptap/core';
import type { EditorStateSnapshot } from '@tiptap/react';

const emptyMenuBarState = {
  isBold: false,
  canBold: false,
  isItalic: false,
  canItalic: false,
  isUnderline: false,
  canUnderline: false,
  isStrike: false,
  canStrike: false,
  isCode: false,
  canCode: false,
  isLink: false,
  linkLabel: '',
  linkHref: '',
  canUnsetLink: false,
  canClearNodes: false,
  isParagraph: false,
  isHeading1: false,
  isHeading2: false,
  isHeading3: false,
  isAlignLeft: false,
  isAlignCenter: false,
  isAlignRight: false,
  isBulletList: false,
  isOrderedList: false,
  isTaskList: false,
  canTaskList: false,
  isBlockquote: false,
  isCodeBlock: false,
  canUndo: false,
  canRedo: false,
};

export function menuBarStateSelector(ctx: EditorStateSnapshot<Editor | null>) {
  if (!ctx.editor) {
    return emptyMenuBarState;
  }

  const { from, to, empty } = ctx.editor.state.selection;
  const linkText = empty ? '' : ctx.editor.state.doc.textBetween(from, to, ' ');
  const linkHref = (ctx.editor.getAttributes('link').href as string | undefined) ?? '';

  return {
    isBold: ctx.editor.isActive('bold') ?? false,
    canBold: ctx.editor.can().chain().toggleBold().run() ?? false,
    isItalic: ctx.editor.isActive('italic') ?? false,
    canItalic: ctx.editor.can().chain().toggleItalic().run() ?? false,
    isUnderline: ctx.editor.isActive('underline') ?? false,
    canUnderline: ctx.editor.can().chain().toggleUnderline().run() ?? false,
    isStrike: ctx.editor.isActive('strike') ?? false,
    canStrike: ctx.editor.can().chain().toggleStrike().run() ?? false,
    isCode: ctx.editor.isActive('code') ?? false,
    canCode: ctx.editor.can().chain().toggleCode().run() ?? false,
    isLink: ctx.editor.isActive('link') ?? false,
    linkLabel: linkText || linkHref,
    linkHref,
    canUnsetLink: ctx.editor.can().chain().unsetLink().run() ?? false,
    canClearNodes: ctx.editor.can().chain().clearNodes().run() ?? false,
    isParagraph: ctx.editor.isActive('paragraph') ?? false,
    isHeading1: ctx.editor.isActive('heading', { level: 1 }) ?? false,
    isHeading2: ctx.editor.isActive('heading', { level: 2 }) ?? false,
    isHeading3: ctx.editor.isActive('heading', { level: 3 }) ?? false,
    isAlignLeft: ctx.editor.isActive({ textAlign: 'left' }) ?? false,
    isAlignCenter: ctx.editor.isActive({ textAlign: 'center' }) ?? false,
    isAlignRight: ctx.editor.isActive({ textAlign: 'right' }) ?? false,
    isBulletList: ctx.editor.isActive('bulletList') ?? false,
    isOrderedList: ctx.editor.isActive('orderedList') ?? false,
    isTaskList: ctx.editor.isActive('taskList') ?? false,
    canTaskList: ctx.editor.can().chain().toggleTaskList().run() ?? false,
    isBlockquote: ctx.editor.isActive('blockquote') ?? false,
    isCodeBlock: ctx.editor.isActive('codeBlock') ?? false,
    canUndo: ctx.editor.can().chain().undo().run() ?? false,
    canRedo: ctx.editor.can().chain().redo().run() ?? false,
  };
}

export type MenuBarState = ReturnType<typeof menuBarStateSelector>;
