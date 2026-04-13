import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FloatingToolbar } from './floating-toolbar';

vi.mock('../../plugins', () => ({
  usePlugins: () => ({
    items: [],
  }),
}));

vi.mock('@tiptap/react', () => ({
  useEditorState: () => ({
    isBold: false,
    canBold: true,
    isItalic: false,
    canItalic: true,
    isStrike: false,
    canStrike: true,
    isUnderline: false,
    canUnderline: true,
    isCode: false,
    canCode: true,
    isHighlight: false,
    canHighlight: true,
    isHeading1: false,
    isHeading2: false,
    isHeading3: false,
    isBulletList: false,
    canBulletList: true,
    isOrderedList: false,
    canOrderedList: true,
    isTaskList: false,
    canTaskList: true,
    isLink: false,
    canUnsetLink: false,
  }),
}));

function createEditorMock() {
  const callbacks = new Map<string, (...args: unknown[]) => void>();
  const chainResult = {
    focus: vi.fn(() => chainResult),
    toggleBold: vi.fn(() => chainResult),
    toggleItalic: vi.fn(() => chainResult),
    toggleStrike: vi.fn(() => chainResult),
    toggleUnderline: vi.fn(() => chainResult),
    toggleCode: vi.fn(() => chainResult),
    toggleHeading: vi.fn(() => chainResult),
    unsetLink: vi.fn(() => chainResult),
    insertContentAt: vi.fn(() => chainResult),
    run: vi.fn(() => true),
  };

  return {
    state: {
      selection: { from: 1, to: 3, empty: false },
      doc: {
        nodesBetween: (_from: number, _to: number, callback: (node: { isText: boolean }) => void) => callback({ isText: true }),
        textBetween: () => 'text',
      },
    },
    storage: {},
    view: {
      coordsAtPos: () => ({ top: 100, left: 140 }),
    },
    on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
      callbacks.set(event, callback);
    }),
    off: vi.fn(),
    getText: vi.fn(() => 'text'),
    chain: vi.fn(() => chainResult),
    __callbacks: callbacks,
  } as never;
}

describe('FloatingToolbar', () => {
  it('shows only comment action for read-only users with comment rights', () => {
    const editor = createEditorMock();
    const onCreateComment = vi.fn();

    render(
      <FloatingToolbar
        editor={editor}
        canEdit={false}
        onOpenLinkModal={vi.fn()}
        onOpenIframeModal={vi.fn()}
        onCreateComment={onCreateComment}
        isAiTransformEnabled
      />,
    );

    expect(screen.getByLabelText('Полужирный (Ctrl+B)')).toBeDisabled();
    expect(screen.queryByLabelText('Заголовок 1')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Вставить ссылку')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Комментировать выделение')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Комментировать выделение'));
    expect(onCreateComment).toHaveBeenCalled();
  });
});
