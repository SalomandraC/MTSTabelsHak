import { NotFoundException } from '@nestjs/common';
import * as Y from 'yjs';
import { HistoryService } from '../src/collab/history.service';

function createSnapshot() {
  const ydoc = new Y.Doc();
  return Buffer.from(Y.encodeStateAsUpdate(ydoc));
}

describe('HistoryService', () => {
  const now = new Date('2026-04-12T08:00:00.000Z');
  const snapshot = createSnapshot();
  let prisma: any;
  let indexingService: any;
  let service: HistoryService;

  beforeEach(() => {
    prisma = {
      wikiNode: {
        findFirst: jest.fn(async () => ({ id: 'page-1' })),
      },
      pageCheckpoint: {
        findMany: jest.fn(async () => [
          {
            id: 'checkpoint-1',
            pageId: 'page-1',
            serverVersion: BigInt(7),
            snapshot,
            stateVector: snapshot,
            trigger: 'manual',
            createdBy: 'user-1',
            createdByName: 'Nikita',
            restoredFromCheckpointId: null,
            createdAt: now,
          },
        ]),
        findFirst: jest.fn(async () => ({
          id: 'checkpoint-1',
          pageId: 'page-1',
          serverVersion: BigInt(7),
          snapshot,
          stateVector: snapshot,
          trigger: 'manual',
          createdBy: 'user-1',
          createdByName: 'Nikita',
          restoredFromCheckpointId: 'checkpoint-0',
          createdAt: now,
        })),
      },
    };
    indexingService = {
      extractFromProsemirrorJson: jest.fn(() => ({ plainTextPreview: 'Version preview' })),
    };
    service = new HistoryService(prisma, indexingService);
  });

  it('lists checkpoint history for the requested page', async () => {
    const response = await service.listHistory('page-1', 10);

    expect(response.items).toEqual([
      expect.objectContaining({
        id: 'checkpoint-1',
        serverVersion: 7,
        createdByName: 'Nikita',
        excerpt: 'Version preview',
      }),
    ]);
    expect(prisma.pageCheckpoint.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { pageId: 'page-1' },
      take: 10,
    }));
  });

  it('rejects history requests for a missing page', async () => {
    prisma.wikiNode.findFirst.mockResolvedValueOnce(null);

    await expect(service.listHistory('missing-page')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns document state and ProseMirror JSON for a checkpoint from the same page', async () => {
    const response = await service.getCheckpoint('page-1', 'checkpoint-1');

    expect(response.checkpoint.restoredFromCheckpointId).toBe('checkpoint-0');
    expect(response.documentState).toEqual(expect.objectContaining({
      encoding: 'base64-yjs-update-v2',
      checkpointId: 'checkpoint-1',
      serverVersion: 7,
    }));
    expect(response.document).toEqual(expect.objectContaining({ type: 'doc' }));
    expect(prisma.pageCheckpoint.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'checkpoint-1',
        pageId: 'page-1',
      },
    });
  });

  it('does not expose checkpoints from another page', async () => {
    prisma.pageCheckpoint.findFirst.mockResolvedValueOnce(null);

    await expect(service.getCheckpoint('page-1', 'checkpoint-from-page-2')).rejects.toBeInstanceOf(NotFoundException);
  });
});
