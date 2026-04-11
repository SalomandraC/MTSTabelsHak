import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResolveTableEmbedResponse } from '../../../shared/api/wikilive';
import { wikiliveApi } from '../../../shared/api/wikilive';
import { useWikiTableEmbed } from './use-wiki-table-embed';

vi.mock('../../../shared/api/wikilive', async () => {
  const actual = await vi.importActual<typeof import('../../../shared/api/wikilive')>('../../../shared/api/wikilive');
  return {
    ...actual,
    wikiliveApi: {
      ...actual.wikiliveApi,
      resolveTableEmbed: vi.fn(),
      listMwsRecords: vi.fn(),
      updateMwsRecords: vi.fn(),
      createMwsRecords: vi.fn(),
      deleteMwsRecords: vi.fn(),
    },
  };
});

const RESOLVE_TABLE_EMBED_MOCK: ResolveTableEmbedResponse = {
  embed: {
    datasheetId: 'dst-2',
    node: {
      id: 'node-2',
      name: 'Таблица 2',
      type: 'Datasheet',
      datasheetId: 'dst-2',
    },
    view: {
      id: 'view-1',
      name: 'Все записи',
      type: 'grid',
    },
    fields: [
      { id: 'fld-title', name: 'Название', type: 'SingleText' },
      { id: 'fld-owner', name: 'Ответственный', type: 'SingleText' },
    ],
    preview: {
      items: [
        {
          recordId: 'rec-1',
          fields: {
            'fld-title': 'Запуск MVP',
            'fld-owner': 'Команда WikiLive',
          },
        },
      ],
      pageNum: 1,
      pageSize: 20,
      total: 1,
    },
    total: 1,
    capabilities: {
      canInlineEdit: true,
      canCreateRecords: true,
      canDeleteRecords: true,
    },
    openInMwsUrl: 'https://tables.mws.ru/fusion/v1/mock',
  },
};

describe('useWikiTableEmbed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(wikiliveApi.resolveTableEmbed).mockResolvedValue(RESOLVE_TABLE_EMBED_MOCK);
  });

  it('loads preview data from backend into the table controller', async () => {
    const attrs = {
      blockId: 'block-1',
      title: 'Таблица 2',
      spaceId: 'space-1',
      nodeId: 'node-2',
      datasheetId: 'dst-2',
      viewId: 'view-1',
      selectedFieldIds: ['fld-title', 'fld-owner'],
      pageSize: 20,
      allowInlineEdit: true,
      displayMode: 'table' as const,
    };
    const { result } = renderHook(() => useWikiTableEmbed(attrs));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(wikiliveApi.resolveTableEmbed).toHaveBeenCalledWith(
      expect.objectContaining({
        datasheetId: 'dst-2',
        nodeId: 'node-2',
        spaceId: 'space-1',
        viewId: 'view-1',
      }),
    );
    expect(result.current.records).toHaveLength(1);
    expect(result.current.total).toBe(1);
    expect(result.current.fields.map((field) => field.name)).toEqual(['Название', 'Ответственный']);
    expect(result.current.records[0]?.fields['fld-title']).toBe('Запуск MVP');
  });
});
