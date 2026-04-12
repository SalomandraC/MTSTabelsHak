import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PageEditorToolbar } from './page-editor-toolbar';

vi.mock('@tiptap/react', () => ({
  useEditorState: () => ({
    isBold: false,
    canBold: true,
    isItalic: false,
    canItalic: true,
    isStrike: false,
    canStrike: true,
    isCode: false,
    canCode: true,
    isUnderline: false,
    canUnderline: true,
    canClearNodes: true,
    isParagraph: true,
    isHeading1: false,
    isHeading2: false,
    isHeading3: false,
    isAlignLeft: true,
    isAlignCenter: false,
    isAlignRight: false,
    isBulletList: false,
    canBulletList: true,
    isOrderedList: false,
    canOrderedList: true,
    isTaskList: false,
    canTaskList: true,
    isBlockquote: false,
    isCodeBlock: false,
    canCodeBlock: true,
    isLink: false,
    linkHref: '',
    linkLabel: '',
    canUnsetLink: false,
    isImageSelected: false,
    canUndo: true,
    canRedo: true,
    canClearFormatting: true,
  }),
}));

function createEditorMock() {
  const chainResult = {
    focus: vi.fn(() => chainResult),
    undo: vi.fn(() => chainResult),
    redo: vi.fn(() => chainResult),
    toggleBold: vi.fn(() => chainResult),
    toggleItalic: vi.fn(() => chainResult),
    toggleStrike: vi.fn(() => chainResult),
    toggleUnderline: vi.fn(() => chainResult),
    setParagraph: vi.fn(() => chainResult),
    toggleHeading: vi.fn(() => chainResult),
    setTextAlign: vi.fn(() => chainResult),
    toggleCodeBlock: vi.fn(() => chainResult),
    toggleBlockquote: vi.fn(() => chainResult),
    unsetAllMarks: vi.fn(() => chainResult),
    clearNodes: vi.fn(() => chainResult),
    run: vi.fn(() => true),
  };

  return {
    chain: vi.fn(() => chainResult),
  } as never;
}

describe('PageEditorToolbar', () => {
  it('disables editing controls but keeps commenting available in read-only mode', () => {
    const onCreateComment = vi.fn();

    render(
      <PageEditorToolbar
        editor={createEditorMock()}
        canEdit={false}
        onOpenLinkModal={vi.fn()}
        onOpenIframeModal={vi.fn()}
        onOpenImageModal={vi.fn()}
        onCreateComment={onCreateComment}
      />,
    );

    expect(screen.getByLabelText('Полужирный (Ctrl+B)')).toBeDisabled();
    expect(screen.getByLabelText('Вставить ссылку')).toBeDisabled();
    expect(screen.getByLabelText('Блок кода')).toBeDisabled();
    expect(screen.getByLabelText('Вставить изображение')).toBeDisabled();

    const commentButton = screen.getByLabelText('Комментировать выделение');
    expect(commentButton).not.toBeDisabled();

    fireEvent.click(commentButton);
    expect(onCreateComment).toHaveBeenCalled();
  });
});
