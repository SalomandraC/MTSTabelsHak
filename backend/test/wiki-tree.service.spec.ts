import { WikiNodeType } from '@prisma/client';
import { WikiTreeService } from '../src/wiki-tree/wiki-tree.service';

describe('WikiTreeService buildTree', () => {
  it('nests folders and pages preserving parent-child relationships', () => {
    const service = new WikiTreeService({} as any);

    const tree = service.buildTree([
      {
        id: 'folder-1',
        spaceId: 'space-1',
        type: WikiNodeType.folder,
        title: 'Folder',
        icon: null,
        parentId: null,
        position: 0,
        isArchived: false,
        children: [],
      },
      {
        id: 'page-1',
        spaceId: 'space-1',
        type: WikiNodeType.page,
        title: 'Page',
        icon: null,
        parentId: 'folder-1',
        position: 0,
        isArchived: false,
        children: [],
      },
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].id).toBe('page-1');
  });
});
