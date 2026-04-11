import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResolveTableEmbedResponse } from '../../../shared/api/wikilive';
import { wikiliveApi } from '../../../shared/api/wikilive';
import { MwsTableEmbedComponent } from './mws-table-embed-component';

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
    fields: [{ id: 'fld-title', name: 'Название', type: 'SingleText' }],
    preview: {
      items: [
        {
          recordId: 'rec-1',
          fields: {
            'fld-title': 'Запуск MVP',
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

describe('MwsTableEmbedComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(wikiliveApi.resolveTableEmbed).mockResolvedValue(RESOLVE_TABLE_EMBED_MOCK);
  });

  it('renders a populated live table instead of an empty state when preview data arrives', async () => {
    render(
      <MwsTableEmbedComponent
        node={{
          attrs: {
            blockId: 'block-1',
            title: 'Таблица 2',
            spaceId: 'space-1',
            nodeId: 'node-2',
            datasheetId: 'dst-2',
            viewId: 'view-1',
            selectedFieldIds: ['fld-title'],
            pageSize: 20,
            allowInlineEdit: true,
            displayMode: 'table',
          },
        } as never}
        selected={false}
        editor={null as never}
        getPos={null as never}
        updateAttributes={vi.fn()}
        deleteNode={vi.fn()}
        decorations={[]}
        extension={null as never}
        HTMLAttributes={{}}
        innerDecorations={null as never}
        view={null as never}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Таблица 2')).toBeInTheDocument();
      expect(screen.getByText(/1\/1 строк/)).toBeInTheDocument();
    });

    expect(screen.queryByText('В выбранном view пока нет строк')).not.toBeInTheDocument();
    expect(screen.getByTestId('mws_canvas_grid')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Открыть в MWS' })).toHaveAttribute(
      'href',
      'https://tables.mws.ru/fusion/v1/mock',
    );
  });
});
