import { WikiNodeType } from '@prisma/client';
import { MwsTablePagesService } from '../src/mws/mws-table-pages.service';

describe('MwsTablePagesService', () => {
  const user = { userId: 'user-1', displayName: 'User 1' };

  it('returns an existing WikiLive page for the same MWS table instead of creating duplicates', async () => {
    const existingPage = {
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
      targetLinks: [],
    };
    const prisma = {
      wikiNode: {
        findFirst: jest.fn().mockResolvedValue(existingPage),
      },
      $transaction: jest.fn(),
    };
    const mwsService = {
      listNodes: jest.fn().mockResolvedValue({
        items: [
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
      }),
    };

    const service = new MwsTablePagesService(prisma as any, mwsService as any);
    const response = await service.createOrOpenTablePage(
      { spaceId: 'space-1', nodeId: 'table-1' },
      user,
    );

    expect(response.created).toBe(false);
    expect(response.page.id).toBe('page-1');
    expect(response.openInMwsUrl).toBe('https://tables.example/workbench/space-1/table-1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
