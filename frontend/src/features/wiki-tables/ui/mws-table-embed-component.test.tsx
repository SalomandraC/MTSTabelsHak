import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const RESOLVE_SELECT_TABLE_EMBED_MOCK: ResolveTableEmbedResponse = {
  embed: {
    datasheetId: 'dst-select',
    node: {
      id: 'node-select',
      name: 'Таблица статусов',
      type: 'Datasheet',
      datasheetId: 'dst-select',
    },
    view: {
      id: 'view-main',
      name: 'Все',
      type: 'grid',
    },
    fields: [
      {
        id: 'fld-status',
        name: 'Статус',
        type: 'SingleSelect',
        property: {
          options: [
            { name: 'Новая', color: 'blue' },
            { name: 'В работе', color: 'orange' },
            { name: 'Готово', color: 'green' },
          ],
        },
      },
    ],
    preview: {
      items: [
        {
          recordId: 'rec-status-1',
          fields: {
            'fld-status': 'Новая',
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

  it('starts inline editing on the first typed key after a cell is selected', async () => {
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

    const canvas = await screen.findByTestId('mws_canvas_grid');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 720,
      height: 320,
      top: 0,
      left: 0,
      right: 720,
      bottom: 320,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(canvas, { clientX: 80, clientY: 60 });
    fireEvent.keyDown(canvas, { key: 'A' });

    const editorInput = await screen.findByDisplayValue('A');
    expect(editorInput).toBeInTheDocument();
  });

  it('opens select dropdown on cell click and updates record when option is chosen', async () => {
    vi.mocked(wikiliveApi.resolveTableEmbed).mockResolvedValueOnce(RESOLVE_SELECT_TABLE_EMBED_MOCK);
    vi.mocked(wikiliveApi.updateMwsRecords).mockResolvedValue({ items: [] });

    render(
      <MwsTableEmbedComponent
        node={{
          attrs: {
            blockId: 'block-select-1',
            title: 'Таблица статусов',
            spaceId: 'space-1',
            nodeId: 'node-select',
            datasheetId: 'dst-select',
            viewId: 'view-main',
            selectedFieldIds: ['fld-status'],
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

    const canvas = await screen.findByTestId('mws_canvas_grid');
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 720,
      height: 320,
      top: 0,
      left: 0,
      right: 720,
      bottom: 320,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(canvas, { clientX: 80, clientY: 60 });

    expect(await screen.findByTestId('mws_select_editor')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /В работе/i }));

    await waitFor(() => {
      expect(wikiliveApi.updateMwsRecords).toHaveBeenCalledWith('dst-select', {
        fieldKey: 'id',
        records: [{ recordId: 'rec-status-1', fields: { 'fld-status': 'В работе' } }],
      });
    });
  });

  it('opens the sort modal from the toolbar', async () => {
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

    fireEvent.click(await screen.findByRole('button', { name: 'Сортировка' }));
    expect(await screen.findByRole('dialog', { name: 'Сортировка' })).toBeInTheDocument();
  });
});
