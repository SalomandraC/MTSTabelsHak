import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
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
  isImageSelected: false,
  isAlignLeft: false,
  isAlignCenter: false,
  isAlignRight: false,
  isBulletList: false,
  canBulletList: false,
  isOrderedList: false,
  canOrderedList: false,
  isTaskList: false,
  canTaskList: false,
  isBlockquote: false,
  isCodeBlock: false,
  canCodeBlock: false,
  canClearFormatting: false,
  canUndo: false,
  canRedo: false,
  isCanvasBlock: false,
};

export function menuBarStateSelector(ctx: EditorStateSnapshot<Editor | null>) {
  if (!ctx.editor) {
    return emptyMenuBarState;
  }

  const { from, to, empty } = ctx.editor.state.selection;
  const selection = ctx.editor.state.selection;
  let selectedRootBlockCount = 0;

  if (!empty) {
    ctx.editor.state.doc.nodesBetween(from, to, (node, _pos, parent) => {
      if (node.type.name === 'rootblock' && parent === ctx.editor?.state.doc) {
        selectedRootBlockCount += 1;
      }
    });
  }

  const canConvertSelectionToList = !empty && selectedRootBlockCount > 0;
  const linkText = empty ? '' : ctx.editor.state.doc.textBetween(from, to, ' ');
  const linkHref = (ctx.editor.getAttributes('link').href as string | undefined) ?? '';
  const isImageSelection = selection instanceof NodeSelection && selection.node.type.name === 'image';
  const selectedImageAlign = isImageSelection
    ? ((selection.node.attrs.align as 'left' | 'center' | 'right' | undefined) ?? 'left')
    : null;
  const textAlign = (ctx.editor.getAttributes('paragraph').textAlign as 'left' | 'center' | 'right' | undefined) ?? 'left';

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
    isImageSelected: isImageSelection,
    isAlignLeft: isImageSelection ? selectedImageAlign === 'left' : textAlign === 'left',
    isAlignCenter: isImageSelection ? selectedImageAlign === 'center' : textAlign === 'center',
    isAlignRight: isImageSelection ? selectedImageAlign === 'right' : textAlign === 'right',
    isBulletList: ctx.editor.isActive('bulletList') ?? false,
    canBulletList: (ctx.editor.can().chain().toggleBulletList().run() ?? false) || canConvertSelectionToList,
    isOrderedList: ctx.editor.isActive('orderedList') ?? false,
    canOrderedList: (ctx.editor.can().chain().toggleOrderedList().run() ?? false) || canConvertSelectionToList,
    isTaskList: ctx.editor.isActive('taskList') ?? false,
    canTaskList: (ctx.editor.can().chain().toggleTaskList().run() ?? false) || canConvertSelectionToList,
    isBlockquote: ctx.editor.isActive('blockquote') ?? false,
    isCodeBlock: ctx.editor.isActive('codeBlock') ?? false,
    canCodeBlock: ctx.editor.can().chain().toggleCodeBlock().run() ?? false,
    canClearFormatting: ctx.editor.can().chain().unsetAllMarks().clearNodes().setParagraph().run() ?? false,
    canUndo: ctx.editor.can().chain().undo().run() ?? false,
    canRedo: ctx.editor.can().chain().redo().run() ?? false,
    isCanvasBlock: ctx.editor.isActive('canvasBlock') ?? false,
  };
}

export type MenuBarState = ReturnType<typeof menuBarStateSelector>;
