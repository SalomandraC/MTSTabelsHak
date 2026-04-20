import { MwsService } from './mws.service';
import type { UserContext } from 'src/auth/user-context';

describe('MwsService', () => {
  let service: MwsService;
  let configService: { get: jest.Mock };
  let redisService: { getJson: jest.Mock; setJson: jest.Mock; delByPattern: jest.Mock };

  const user = {
    userId: 'user-1',
    authToken: 'token-1',
  } as UserContext;

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string, fallback?: string) => fallback),
    };
    redisService = {
      getJson: jest.fn().mockResolvedValue(null),
      setJson: jest.fn().mockResolvedValue(undefined),
      delByPattern: jest.fn().mockResolvedValue(undefined),
    };

    service = new MwsService(
      {} as never,
      configService as never,
      {} as never,
      redisService as never,
    );
  });

  it('normalizes createField response to the frontend field shape', async () => {
    const requestSpy = jest.spyOn(service as any, 'request') as jest.Mock;
    requestSpy.mockResolvedValue({
      data: { id: 'fld-created', name: 'Новый столбец' },
    });

    const result = await service.createField(
      'space-1',
      'dst-1',
      {
        name: 'Новый столбец',
        type: 'SingleText',
        property: { precision: 2 },
      },
      user,
    );

    expect(result).toEqual({
      field: {
        id: 'fld-created',
        name: 'Новый столбец',
        type: 'SingleText',
        description: null,
        property: { precision: 2 },
      },
    });
  });

  it('normalizes created records from the YAML response shape', async () => {
    const requestSpy = jest.spyOn(service as any, 'request') as jest.Mock;
    requestSpy.mockResolvedValue({
      data: {
        records: [
          {
            recordId: 'rec-1',
            fields: { 'fld-title': 'Запуск MVP' },
            createdAt: 1710000000000,
            updatedAt: 1710000005000,
          },
        ],
      },
    });

    const result = await service.createRecords(
      'dst-1',
      {
        fieldKey: 'id',
        records: [{ fields: { 'fld-title': 'Запуск MVP' } }],
      },
      user,
    );

    expect(result).toEqual({
      items: [
        {
          recordId: 'rec-1',
          fields: { 'fld-title': 'Запуск MVP' },
          createdAt: 1710000000000,
          updatedAt: 1710000005000,
        },
      ],
    });
  });

  it('keeps MWS view fields authoritative and appends new fields beyond selectedFieldIds', async () => {
    jest.spyOn(service, 'getNode').mockResolvedValue({
      item: {
        id: 'node-1',
        name: 'Таблица',
        type: 'Datasheet',
        spaceId: 'space-1',
        parentId: null,
        path: ['Таблица'],
        datasheetId: 'dst-1',
        dstId: 'dst-1',
        openInMwsUrl: 'https://tables.mws.ru/workbench/space-1/node-1',
        children: [],
      },
    });
    jest.spyOn(service, 'listFields').mockResolvedValue({
      items: [
        { id: 'fld-title', name: 'Название', type: 'SingleText' },
        { id: 'fld-owner', name: 'Ответственный', type: 'SingleText' },
        { id: 'fld-status', name: 'Статус', type: 'SingleText' },
      ],
    });
    jest.spyOn(service, 'listViews').mockResolvedValue({
      items: [{ id: 'view-1', name: 'Все', type: 'Grid' }],
    });
    const listRecordsSpy = jest.spyOn(service, 'listRecords').mockResolvedValue({
      items: [
        {
          recordId: 'rec-1',
          fields: {
            'fld-title': 'Запуск MVP',
            'fld-owner': 'Команда',
            'fld-status': 'В работе',
          },
          createdAt: 1710000000000,
          updatedAt: 1710000005000,
        },
      ],
      pageNum: 1,
      pageSize: 20,
      total: 1,
    });

    const result = await service.resolveTableEmbed(
      {
        spaceId: 'space-1',
        nodeId: 'node-1',
        datasheetId: 'dst-1',
        viewId: 'view-1',
        selectedFieldIds: ['fld-title'],
        pageSize: 20,
        allowInlineEdit: true,
      },
      user,
    );

    expect(listRecordsSpy).toHaveBeenCalledWith(
      'dst-1',
      expect.not.objectContaining({
        fields: expect.anything(),
      }),
      user,
    );
    expect(result.embed.fields.map((field) => field.id)).toEqual([
      'fld-title',
      'fld-owner',
      'fld-status',
    ]);
  });
});
