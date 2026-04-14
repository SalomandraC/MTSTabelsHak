import { ContextIndexingService } from '../src/context-engine/context-indexing.service';

describe('ContextIndexingService', () => {
  let prisma: any;
  let contextEngineClient: any;
  let service: ContextIndexingService;

  beforeEach(() => {
    prisma = {
      wikiNode: {
        findUnique: jest.fn(),
      },
    };
    contextEngineClient = {
      indexDocument: jest.fn(),
      deleteDocument: jest.fn(),
      logUnavailable: jest.fn(),
    };

    service = new ContextIndexingService(prisma, contextEngineClient);
  });

  it('indexes page text with ancestor folder ids', async () => {
    prisma.wikiNode.findUnique
      .mockResolvedValueOnce({
        id: 'page-1',
        spaceId: 'space-1',
        title: 'Spec',
        updatedAt: new Date('2026-04-14T10:00:00.000Z'),
        isArchived: false,
        type: 'page',
      })
      .mockResolvedValueOnce({ parentId: 'folder-child' })
      .mockResolvedValueOnce({
        id: 'folder-child',
        parentId: 'folder-root',
        type: 'folder',
        isArchived: false,
      })
      .mockResolvedValueOnce({
        id: 'folder-root',
        parentId: null,
        type: 'mws_folder',
        isArchived: false,
      });

    await service.indexPage({
      pageId: 'page-1',
      plainText: 'Alpha beta gamma',
      snapshotVersion: 7,
    });

    expect(contextEngineClient.indexDocument).toHaveBeenCalledWith({
      pageId: 'page-1',
      spaceId: 'space-1',
      title: 'Spec',
      folderIds: ['folder-child', 'folder-root'],
      snapshotVersion: 7,
      text: 'Alpha beta gamma',
      updatedAt: '2026-04-14T10:00:00.000Z',
    });
    expect(contextEngineClient.deleteDocument).not.toHaveBeenCalled();
  });

  it('removes page from index when text is empty', async () => {
    prisma.wikiNode.findUnique.mockResolvedValueOnce({
      id: 'page-1',
      spaceId: 'space-1',
      title: 'Empty',
      updatedAt: new Date('2026-04-14T10:00:00.000Z'),
      isArchived: false,
      type: 'page',
    });

    await service.indexPage({
      pageId: 'page-1',
      plainText: '   ',
      snapshotVersion: 3,
    });

    expect(contextEngineClient.deleteDocument).toHaveBeenCalledWith('page-1');
    expect(contextEngineClient.indexDocument).not.toHaveBeenCalled();
  });
});
