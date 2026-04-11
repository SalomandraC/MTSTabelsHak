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
        params: undefined,
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
});
