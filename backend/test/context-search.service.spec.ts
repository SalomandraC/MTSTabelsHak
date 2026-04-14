import { ContextSearchService } from '../src/context-engine/context-search.service';

describe('ContextSearchService', () => {
  let prisma: any;
  let contextEngineClient: any;
  let pageAccessService: any;
  let service: ContextSearchService;

  beforeEach(() => {
    prisma = {
      wikiNode: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    contextEngineClient = {
      search: jest.fn(),
    };
    pageAccessService = {
      assertCanAccessSpace: jest.fn(),
    };

    service = new ContextSearchService(prisma, contextEngineClient, pageAccessService);
  });

  it('resolves selected folders and direct pages into scoped page ids for search', async () => {
    prisma.wikiNode.findMany
      .mockResolvedValueOnce([{ id: 'page-direct' }])
      .mockResolvedValueOnce([{ id: 'folder-child' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'page-in-root' }, { id: 'page-in-child' }]);

    prisma.wikiNode.findUnique
      .mockResolvedValueOnce({
        id: 'folder-root',
        spaceId: 'space-1',
        type: 'folder',
        isArchived: false,
      })
      .mockResolvedValueOnce({
        id: 'folder-child',
        spaceId: 'space-1',
        type: 'mws_folder',
        isArchived: false,
      });

    contextEngineClient.search.mockResolvedValue({
      items: [
        {
          chunkId: 'page-direct:0',
          pageId: 'page-direct',
          spaceId: 'space-1',
          title: 'Direct page',
          chunkText: 'direct snippet',
          chunkIndex: 0,
          score: 0.95,
        },
      ],
    });

    const result = await service.searchInSpace(
      { userId: 'user-1', displayName: 'Tester' },
      {
        spaceId: 'space-1',
        query: 'alpha',
        pageIds: ['page-direct'],
        folderIds: ['folder-root'],
        topK: 5,
      },
    );

    expect(pageAccessService.assertCanAccessSpace).toHaveBeenCalledWith('space-1', {
      userId: 'user-1',
      displayName: 'Tester',
    });
    expect(contextEngineClient.search).toHaveBeenCalledWith({
      spaceId: 'space-1',
      query: 'alpha',
      pageIds: ['page-direct', 'page-in-root', 'page-in-child'],
      topK: 5,
    });
    expect(result.items).toEqual([
      {
        pageId: 'page-direct',
        title: 'Direct page',
        snippet: 'direct snippet',
        score: 0.95,
        chunkIndex: 0,
      },
    ]);
  });

  it('searches whole space when explicit scope is not provided', async () => {
    contextEngineClient.search.mockResolvedValue({ items: [] });

    await service.searchInSpace(
      { userId: 'user-1', displayName: 'Tester' },
      {
        spaceId: 'space-1',
        query: 'whole space',
      },
    );

    expect(contextEngineClient.search).toHaveBeenCalledWith({
      spaceId: 'space-1',
      query: 'whole space',
      pageIds: undefined,
      topK: undefined,
    });
  });
});
