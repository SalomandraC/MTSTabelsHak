import * as Y from 'yjs';
import { CollabPersistenceService } from '../src/collab/collab-persistence.service';

describe('CollabPersistenceService', () => {
  it('stores checkpoint author display name and restore source', async () => {
    const snapshot = Buffer.from(Y.encodeStateAsUpdate(new Y.Doc())).toString('base64');
    const now = new Date('2026-04-12T09:00:00.000Z');
    const prisma: any = {
      pageDocument: {
        findUnique: jest.fn(async () => ({ serverVersion: BigInt(11) })),
      },
      pageCheckpoint: {
        create: jest.fn(async ({ data }: any) => ({
          id: 'checkpoint-2',
          serverVersion: data.serverVersion,
          createdAt: now,
        })),
      },
      wikiPage: {
        update: jest.fn(async () => ({})),
      },
    };
    const service = new CollabPersistenceService(
      prisma,
      { extractFromProsemirrorJson: jest.fn() } as any,
      { indexPage: jest.fn() } as any,
      { autoResolveMissingAnchorsAfterRestore: jest.fn() } as any,
      { broadcastPageUpdated: jest.fn() } as any,
      { add: jest.fn() } as any,
    );
    jest.spyOn(service, 'storeDocument').mockResolvedValue(undefined);
    jest.spyOn(service, 'reindexPage').mockResolvedValue(undefined);

    const response = await service.createCheckpoint(
      'page-1',
      snapshot,
      { userId: 'user-1', displayName: 'Nikita' },
      'restore',
      'checkpoint-1',
    );

    expect(response).toEqual({
      checkpointId: 'checkpoint-2',
      persistedAt: now,
      serverVersion: 11,
    });
    expect(prisma.pageCheckpoint.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        trigger: 'restore',
        createdBy: 'user-1',
        createdByName: 'Nikita',
        restoredFromCheckpointId: 'checkpoint-1',
      }),
    }));
  });
});
