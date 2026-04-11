import { BadRequestException } from '@nestjs/common';
import { of } from 'rxjs';
import { MwsService } from '../src/mws/mws.service';

describe('MwsService', () => {
  const user = { userId: 'user-1', displayName: 'User 1' };

  function createService(resolver: (url: string, options: any) => unknown) {
    const httpService = {
      request: jest.fn((options) => of({ data: resolver(options.url, options) })),
    };
    const configService = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'MWS_TABLES_BASE_URL') {
          return 'https://tables.example/fusion/v1';
        }
        if (key === 'MWS_TABLES_API_TOKEN') {
          return 'demo-token';
        }
        return fallback;
      }),
    };
    const redisService = {
      getJson: jest.fn(() => Promise.resolve(null)),
      setJson: jest.fn(() => Promise.resolve()),
      del: jest.fn(() => Promise.resolve()),
      delByPattern: jest.fn(() => Promise.resolve()),
    };

    return {
      service: new MwsService(httpService as any, configService as any, redisService as any),
      httpService,
      redisService,
    };
  }

  it('returns nested MWS nodes with path metadata without upstream tree filtering', async () => {
    const { service, httpService } = createService(() => ({
      data: {
        nodes: [
          {
            id: 'folder-1',
            name: 'Folder',
            type: 'folder',
            children: [
              {
                id: 'node-1',
                name: 'Nested table',
                type: 'datasheet',
                dstId: 'dst-1',
              },
            ],
          },
        ],
      },
    }));

    const response = await service.listNodes('space-1', 'datasheet', true, user);

    expect(httpService.request).toHaveBeenCalledWith(
      expect.objectContaining({
        params: {
          includeChildren: true,
          type: 'datasheet',
        },
      }),
    );
    expect(response.items).toHaveLength(1);
    expect(response.items[0].children[0]).toEqual(
      expect.objectContaining({
        id: 'node-1',
        datasheetId: 'dst-1',
        path: ['Folder', 'Nested table'],
      }),
    );
  });

  it('hydrates folder children recursively from node details', async () => {
    const { service, httpService } = createService((url) => {
      if (url.endsWith('/spaces/space-1/nodes')) {
        return {
          data: {
            nodes: [
              {
                id: 'folder-1',
                name: 'Трекер задач',
                type: 'Folder',
              },
            ],
          },
        };
      }

      if (url.endsWith('/nodes/folder-1')) {
        return {
          data: {
            id: 'folder-1',
            name: 'Трекер задач',
            type: 'Folder',
            children: [
              {
                id: 'folder-2',
                name: 'Задачи',
                type: 'Folder',
              },
            ],
          },
        };
      }

      if (url.endsWith('/nodes/folder-2')) {
        return {
          data: {
            id: 'folder-2',
            name: 'Задачи',
            type: 'Folder',
            children: [
              {
                id: 'mirror-1',
                name: 'Все задачи',
                type: 'Mirror',
              },
            ],
          },
        };
      }

      return { data: {} };
    });

    const response = await service.listNodes('space-1', undefined, true, user);

    expect(httpService.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://tables.example/fusion/v1/nodes/folder-1',
      }),
    );
    expect(httpService.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://tables.example/fusion/v1/nodes/folder-2',
      }),
    );
    expect(response.items[0].children[0].children[0]).toEqual(
      expect.objectContaining({
        id: 'mirror-1',
        parentId: 'folder-2',
        path: ['Трекер задач', 'Задачи', 'Все задачи'],
      }),
    );
  });

  it('uses user MWS token before env fallback', async () => {
    const { service, httpService } = createService(() => ({ data: { spaces: [] } }));

    await service.listSpaces({ ...user, mwsToken: 'user-token' });

    expect(httpService.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer user-token',
        }),
      }),
    );
  });

  it('fails when no MWS token exists in user context or environment', async () => {
    const previousToken = process.env.MWS_TABLES_API_TOKEN;
    delete process.env.MWS_TABLES_API_TOKEN;

    const httpService = {
      request: jest.fn(),
    };
    const configService = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'MWS_TABLES_BASE_URL') {
          return 'https://tables.example/fusion/v1';
        }
        return fallback;
      }),
    };
    const redisService = {
      getJson: jest.fn(() => Promise.resolve(null)),
      setJson: jest.fn(() => Promise.resolve()),
      del: jest.fn(() => Promise.resolve()),
      delByPattern: jest.fn(() => Promise.resolve()),
    };

    try {
      const service = new MwsService(httpService as any, configService as any, redisService as any);
      await expect(service.listSpaces(user)).rejects.toBeInstanceOf(BadRequestException);
    } finally {
      if (previousToken) {
        process.env.MWS_TABLES_API_TOKEN = previousToken;
      }
    }
  });

  it('aggregates live grid metadata for table embeds', async () => {
    const { service } = createService((url) => {
      if (url.endsWith('/nodes/node-1')) {
        return { data: { id: 'node-1', name: 'Roadmap', type: 'datasheet', dstId: 'dst-1' } };
      }
      if (url.endsWith('/datasheets/dst-1/fields')) {
        return { data: { fields: [{ id: 'fld-1', name: 'Name', type: 'SingleText' }] } };
      }
      if (url.endsWith('/datasheets/dst-1/views')) {
        return { data: { views: [{ id: 'viw-1', name: 'Grid', type: 'table' }] } };
      }
      if (url.endsWith('/datasheets/dst-1/records')) {
        return { data: { records: [{ recordId: 'rec-1', fields: { 'fld-1': 'Task' } }], pageNum: 1, pageSize: 20, total: 1 } };
      }
      return { data: {} };
    });

    const response = await service.resolveTableEmbed(
      {
        spaceId: 'space-1',
        nodeId: 'node-1',
        datasheetId: 'dst-1',
        viewId: 'viw-1',
        pageSize: 20,
        allowInlineEdit: true,
      },
      user,
    );

    expect(response.embed.views).toHaveLength(1);
    expect(response.embed.fields).toHaveLength(1);
    expect(response.embed.preview.items[0].recordId).toBe('rec-1');
    expect(response.embed.total).toBe(1);
    expect(response.embed.capabilities.canInlineEdit).toBe(true);
  });

  it('reads nested upstream records payloads so table previews are not empty', async () => {
    const { service } = createService((url) => {
      if (url.endsWith('/datasheets/dst-1/records')) {
        return {
          data: {
            records: {
              items: [{ recordId: 'rec-nested-1', fields: { 'fld-1': 'Nested task' } }],
              total: 1,
              pageNum: 1,
              pageSize: 25,
            },
          },
        };
      }

      return { data: {} };
    });

    const response = await service.listRecords(
      'dst-1',
      {
        pageNum: 1,
        pageSize: 25,
      },
      user,
    );

    expect(response.items).toEqual([{ recordId: 'rec-nested-1', fields: { 'fld-1': 'Nested task' } }]);
    expect(response.total).toBe(1);
    expect(response.pageNum).toBe(1);
    expect(response.pageSize).toBe(25);
  });

  it('resolves embed preview records from nested upstream payloads', async () => {
    const { service } = createService((url) => {
      if (url.endsWith('/nodes/node-1')) {
        return { data: { id: 'node-1', name: 'Roadmap', type: 'datasheet', dstId: 'dst-1' } };
      }
      if (url.endsWith('/datasheets/dst-1/fields')) {
        return { data: { fields: { items: [{ id: 'fld-1', name: 'Name', type: 'SingleText' }] } } };
      }
      if (url.endsWith('/datasheets/dst-1/views')) {
        return { data: { views: { items: [{ id: 'viw-1', name: 'Grid', type: 'table' }] } } };
      }
      if (url.endsWith('/datasheets/dst-1/records')) {
        return {
          data: {
            records: {
              items: [{ recordId: 'rec-1', fields: { 'fld-1': 'Task from nested payload' } }],
              pageNum: 1,
              pageSize: 20,
              total: 1,
            },
          },
        };
      }
      return { data: {} };
    });

    const response = await service.resolveTableEmbed(
      {
        spaceId: 'space-1',
        nodeId: 'node-1',
        datasheetId: 'dst-1',
        viewId: 'viw-1',
        pageSize: 20,
        allowInlineEdit: true,
      },
      user,
    );

    expect(response.embed.fields[0].id).toBe('fld-1');
    expect(response.embed.views[0].id).toBe('viw-1');
    expect(response.embed.preview.items[0].fields['fld-1']).toBe('Task from nested payload');
    expect(response.embed.total).toBe(1);
  });

  it('invalidates datasheet cache after record mutations', async () => {
    const { service, redisService } = createService(() => ({
      data: {
        records: [{ recordId: 'rec-1', fields: {} }],
      },
    }));

    await service.createRecords(
      'dst-1',
      {
        fieldKey: 'id',
        records: [{ fields: {} }],
      },
      user,
    );

    expect(redisService.delByPattern).toHaveBeenCalledWith('mws:records:dst-1:*');
    expect(redisService.delByPattern).toHaveBeenCalledWith('mws:embed:*');
    expect(redisService.delByPattern).toHaveBeenCalledWith('mws:fields:dst-1:*');
    expect(redisService.del).toHaveBeenCalledWith('mws:views:dst-1');
  });

  it('deletes MWS datasheets through the space-scoped upstream endpoint', async () => {
    const { service, httpService, redisService } = createService(() => ({
      data: {
        success: true,
      },
    }));

    const response = await service.deleteDatasheet('space-1', 'dst-1', user);

    expect(response.deleted).toBe(true);
    expect(httpService.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'DELETE',
        url: 'https://tables.example/fusion/v1/spaces/space-1/datasheet/dst-1',
      }),
    );
    expect(redisService.delByPattern).toHaveBeenCalledWith('mws:nodes:space-1:*');
    expect(redisService.delByPattern).toHaveBeenCalledWith('mws:records:dst-1:*');
  });
});
