import { WikiNodeType } from '@prisma/client';
import { WorkspaceTreeService } from '../src/workspace/workspace-tree.service';

describe('WorkspaceTreeService', () => {
  const user = { userId: 'user-1', displayName: 'User 1' };

  it('overlays linked WikiLive pages as siblings after MWS tables', async () => {
    const mwsService = {
      listNodes: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'folder-1',
            name: 'Folder',
            type: 'folder',
            spaceId: 'space-1',
            parentId: null,
            path: ['Folder'],
            datasheetId: null,
            dstId: null,
            openInMwsUrl: 'https://tables.example/workbench/space-1/folder-1',
            children: [
              {
                id: 'table-1',
                name: 'Roadmap',
                type: 'datasheet',
                spaceId: 'space-1',
                parentId: 'folder-1',
                path: ['Folder', 'Roadmap'],
                datasheetId: 'dst-1',
                dstId: 'dst-1',
                openInMwsUrl: 'https://tables.example/workbench/space-1/table-1',
                children: [],
              },
            ],
          },
        ],
      }),
    };
    const prisma = {
      wikiNode: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'page-1',
            spaceId: 'space-1',
            type: WikiNodeType.page,
            parentId: null,
            title: 'Wiki: Roadmap',
            icon: 'doc',
            position: 0,
            isArchived: false,
            mwsSpaceId: 'space-1',
            mwsParentNodeId: 'folder-1',
            mwsSourceNodeId: 'table-1',
            mwsDatasheetId: 'dst-1',
            createdBy: 'user-1',
            updatedBy: 'user-1',
            createdAt: new Date('2026-01-01T00:00:00Z'),
            updatedAt: new Date('2026-01-01T00:00:00Z'),
            page: { plainTextPreview: 'Live MWS Tables: Roadmap' },
            targetLinks: [],
          },
        ]),
      },
    };

    const service = new WorkspaceTreeService(prisma as any, mwsService as any);
    const response = await service.getTree('space-1', user);

    expect(response.items[0].kind).toBe('mwsFolder');
    expect(response.items[0].children.map((node) => node.kind)).toEqual(['mwsTable', 'wikiPage']);
    expect(response.items[0].children[1]).toEqual(
      expect.objectContaining({
        id: 'page-1',
        linkedPageId: 'page-1',
        parentId: 'mws:folder-1',
        title: 'Wiki: Roadmap',
      }),
    );
  });
});
