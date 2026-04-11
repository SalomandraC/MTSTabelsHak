import { describe, expect, it } from 'vitest';

import type { MwsNode } from '../../../shared/api/wikilive';
import { filterNodesForPicker } from './use-table-picker-controller';

describe('filterNodesForPicker', () => {
  it('keeps only folders that lead to tables and removes unrelated node types', () => {
    const nodes: MwsNode[] = [
      {
        id: 'folder-1',
        name: 'Проекты',
        type: 'Folder',
        children: [
          {
            id: 'table-1',
            name: 'Таблица 1',
            type: 'Datasheet',
            datasheetId: 'dst-1',
          },
          {
            id: 'view-like-node',
            name: 'All Items',
            type: 'View',
            children: [],
          },
        ],
      },
      {
        id: 'dashboard-1',
        name: 'Dashboard',
        type: 'Dashboard',
        children: [],
      },
      {
        id: 'table-2',
        name: 'Таблица 2',
        type: 'Datasheet',
        datasheetId: 'dst-2',
      },
    ];

    expect(filterNodesForPicker(nodes)).toEqual([
      {
        id: 'folder-1',
        name: 'Проекты',
        type: 'Folder',
        children: [
          {
            id: 'table-1',
            name: 'Таблица 1',
            type: 'Datasheet',
            datasheetId: 'dst-1',
            children: [],
          },
        ],
      },
      {
        id: 'table-2',
        name: 'Таблица 2',
        type: 'Datasheet',
        datasheetId: 'dst-2',
        children: [],
      },
    ]);
  });
});
