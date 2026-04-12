import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CommentsPanel } from './comments-panel';

vi.mock('../../../shared/api/wikilive', async () => {
  const actual = await vi.importActual<typeof import('../../../shared/api/wikilive')>('../../../shared/api/wikilive');
  return {
    ...actual,
    getCurrentUser: vi.fn(() => ({
      userId: 'user-1',
      displayName: 'Ivan',
    })),
  };
});

const baseThread = {
  id: 'thread-1',
  pageId: 'page-1',
  anchorText: 'Выделенный текст',
  status: 'open' as const,
  createdBy: 'user-1',
  createdByName: 'Ivan',
  resolvedBy: null,
  resolvedAt: null,
  createdAt: '2026-04-12T10:00:00.000Z',
  updatedAt: '2026-04-12T10:00:00.000Z',
  isDraft: false,
  messages: [
    {
      id: 'message-1',
      threadId: 'thread-1',
      body: 'Первый комментарий',
      createdBy: 'user-1',
      createdByName: 'Ivan',
      createdAt: '2026-04-12T10:00:00.000Z',
      updatedAt: '2026-04-12T10:00:00.000Z',
      deletedAt: null,
    },
  ],
};

describe('CommentsPanel', () => {
  it('hides reply form and resolve action when commenting is disabled', () => {
    render(
      <CommentsPanel
        activeThread={baseThread}
        activeThreadId={baseThread.id}
        isLoading={false}
        errorMessage=""
        canComment={false}
        onRetry={vi.fn()}
        onClose={vi.fn()}
        onSubmitMessage={vi.fn(async () => undefined)}
        onEditMessage={vi.fn(async () => undefined)}
        onDeleteMessage={vi.fn(async () => undefined)}
        onResolveThread={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.queryByLabelText('Решить вопрос')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Комментарий')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Отправить комментарий')).not.toBeInTheDocument();
  });

  it('submits a reply when commenting is available', async () => {
    const onSubmitMessage = vi.fn(async () => undefined);

    render(
      <CommentsPanel
        activeThread={baseThread}
        activeThreadId={baseThread.id}
        isLoading={false}
        errorMessage=""
        canComment
        onRetry={vi.fn()}
        onClose={vi.fn()}
        onSubmitMessage={onSubmitMessage}
        onEditMessage={vi.fn(async () => undefined)}
        onDeleteMessage={vi.fn(async () => undefined)}
        onResolveThread={vi.fn(async () => undefined)}
      />,
    );

    fireEvent.change(screen.getByLabelText('Комментарий'), {
      target: { value: 'Новый ответ' },
    });
    fireEvent.click(screen.getByLabelText('Отправить комментарий'));

    expect(onSubmitMessage).toHaveBeenCalledWith('Новый ответ');
  });
});
