import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommentsService } from '../src/comments/comments.service';

describe('CommentsService', () => {
  const user = { userId: 'user-1', displayName: 'Ivan Ivanov' };
  const otherUser = { userId: 'user-2', displayName: 'Anna' };
  const now = new Date('2026-04-11T12:00:00.000Z');

  const makeThread = (overrides: Record<string, unknown> = {}) => ({
    id: '3c260020-e30a-4ef8-9748-ecb3a7d55653',
    pageId: 'page-1',
    anchorText: 'selected text',
    status: 'open',
    createdBy: user.userId,
    createdByName: user.displayName,
    resolvedBy: null,
    resolvedAt: null,
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        id: 'message-1',
        threadId: '3c260020-e30a-4ef8-9748-ecb3a7d55653',
        body: 'First comment',
        createdBy: user.userId,
        createdByName: user.displayName,
        createdAt: now,
        updatedAt: now,
      },
    ],
    ...overrides,
  });

  let prisma: any;
  let service: CommentsService;

  beforeEach(() => {
    prisma = {
      wikiNode: {
        findFirst: jest.fn(async () => ({ id: 'page-1' })),
      },
      pageCommentThread: {
        findMany: jest.fn(async () => [makeThread()]),
        findUnique: jest.fn(async () => null),
        findFirst: jest.fn(async () => ({ id: '3c260020-e30a-4ef8-9748-ecb3a7d55653' })),
        create: jest.fn(async ({ data }: any) => makeThread({
          id: data.id,
          anchorText: data.anchorText,
          messages: [
            {
              id: 'message-1',
              threadId: data.id,
              body: data.messages.create.body,
              createdBy: data.messages.create.createdBy,
              createdByName: data.messages.create.createdByName,
              createdAt: now,
              updatedAt: now,
            },
          ],
        })),
        update: jest.fn(async ({ data }: any) => makeThread({
          status: data.status,
          resolvedBy: data.resolvedBy,
          resolvedAt: data.resolvedAt,
        })),
      },
      pageCommentMessage: {
        create: jest.fn(async () => ({ id: 'message-2' })),
        findFirst: jest.fn(async () => ({ id: 'message-1', createdBy: user.userId })),
        update: jest.fn(async () => ({ id: 'message-1' })),
      },
    };

    service = new CommentsService(prisma);
  });

  it('creates a thread with a first message from the current user', async () => {
    const response = await service.createThread(
      'page-1',
      {
        threadId: '3c260020-e30a-4ef8-9748-ecb3a7d55653',
        anchorText: ' selected text ',
        body: ' First comment ',
      },
      user,
    );

    expect(response.thread.id).toBe('3c260020-e30a-4ef8-9748-ecb3a7d55653');
    expect(response.thread.messages[0].body).toBe('First comment');
    expect(prisma.pageCommentThread.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        anchorText: 'selected text',
        createdBy: user.userId,
        messages: {
          create: expect.objectContaining({ body: 'First comment' }),
        },
      }),
    }));
  });

  it('filters visible messages when listing threads', async () => {
    await service.listThreads('page-1', false);

    expect(prisma.pageCommentThread.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ pageId: 'page-1', status: 'open' }),
      include: {
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
        },
      },
    }));
  });

  it('rejects edits by a different user', async () => {
    prisma.pageCommentMessage.findFirst.mockResolvedValueOnce({ id: 'message-1', createdBy: otherUser.userId });

    await expect(service.updateMessage('page-1', 'thread-1', 'message-1', { body: 'Nope' }, user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects replies for a thread from another page', async () => {
    prisma.pageCommentThread.findFirst.mockResolvedValueOnce(null);

    await expect(service.addMessage('page-1', 'missing-thread', { body: 'Reply' }, user)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('marks thread as resolved by the current user', async () => {
    const response = await service.updateThread('page-1', 'thread-1', { status: 'resolved' }, user);

    expect(response.thread.status).toBe('resolved');
    expect(prisma.pageCommentThread.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'resolved',
        resolvedBy: user.userId,
      }),
    }));
  });
});
