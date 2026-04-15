import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResolveTableEmbedResponse } from '../../../shared/api/wikilive';
import { wikiliveApi } from '../../../shared/api/wikilive';
import { MwsTableEmbedComponent } from './mws-table-embed-component';

vi.mock('../../../shared/api/wikilive', async () => {
  const actual = await vi.importActual<
    typeof import('../../../shared/api/wikilive')
  >('../../../shared/api/wikilive');
  return {
    ...actual,
    wikiliveApi: {
      ...actual.wikiliveApi,
      resolveTableEmbed: vi.fn(),
      listMwsRecords: vi.fn(),
      createMwsField: vi.fn(),
      uploadMwsAttachment: vi.fn(),
      updateMwsRecords: vi.fn(),
      createMwsRecords: vi.fn(),
      deleteMwsRecords: vi.fn()
    }
  };
});

const RESOLVE_TABLE_EMBED_MOCK: ResolveTableEmbedResponse = {
  embed: {
    datasheetId: 'dst-2',
    node: {
      id: 'node-2',
      name: 'Таблица 2',
      type: 'Datasheet',
      datasheetId: 'dst-2'
    },
    view: {
      id: 'view-1',
      name: 'Все записи',
      type: 'grid'
    },
    fields: [{ id: 'fld-title', name: 'Название', type: 'SingleText' }],
    preview: {
      items: [
        {
          recordId: 'rec-1',
          fields: {
            'fld-title': 'Запуск MVP'
          }
        }
      ],
      pageNum: 1,
      pageSize: 20,
      total: 1
    },
    total: 1,
    capabilities: {
      canInlineEdit: true,
      canCreateRecords: true,
      canDeleteRecords: true
    },
    openInMwsUrl: 'https://tables.mws.ru/fusion/v1/mock'
  }
};

const RESOLVE_SELECT_TABLE_EMBED_MOCK: ResolveTableEmbedResponse = {
  embed: {
    datasheetId: 'dst-select',
    node: {
      id: 'node-select',
      name: 'Таблица статусов',
      type: 'Datasheet',
      datasheetId: 'dst-select'
    },
    view: {
      id: 'view-main',
      name: 'Все',
      type: 'grid'
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
            { name: 'Готово', color: 'green' }
          ]
        }
      }
    ],
    preview: {
      items: [
        {
          recordId: 'rec-status-1',
          fields: {
            'fld-status': 'Новая'
          }
        }
      ],
      pageNum: 1,
      pageSize: 20,
      total: 1
    },
    total: 1,
    capabilities: {
      canInlineEdit: true,
      canCreateRecords: true,
      canDeleteRecords: true
    },
    openInMwsUrl: 'https://tables.mws.ru/fusion/v1/mock'
  }
};

const RESOLVE_ATTACHMENT_TABLE_EMBED_MOCK: ResolveTableEmbedResponse = {
  embed: {
    datasheetId: 'dst-attachment',
    node: {
      id: 'node-attachment',
      name: 'Таблица вложений',
      type: 'Datasheet',
      datasheetId: 'dst-attachment'
    },
    view: {
      id: 'view-main',
      name: 'Все',
      type: 'grid'
    },
    fields: [{ id: 'fld-files', name: 'Файлы', type: 'Attachment' }],
    preview: {
      items: [
        {
          recordId: 'rec-attachment-1',
          fields: {
            'fld-files': [
              {
                name: 'Скриншот.png',
                token: 'file-token-1',
                url: 'https://example.com/file-1'
              }
            ]
          }
        }
      ],
      pageNum: 1,
      pageSize: 20,
      total: 1
    },
    total: 1,
    capabilities: {
      canInlineEdit: true,
      canCreateRecords: true,
      canDeleteRecords: true
    },
    openInMwsUrl: 'https://tables.mws.ru/fusion/v1/mock'
  }
};

const RESOLVE_EMPTY_ATTACHMENT_TABLE_EMBED_MOCK: ResolveTableEmbedResponse = {
  embed: {
    datasheetId: 'dst-attachment-empty',
    node: {
      id: 'node-attachment-empty',
      name: 'Таблица пустых вложений',
      type: 'Datasheet',
      datasheetId: 'dst-attachment-empty'
    },
    view: {
      id: 'view-main',
      name: 'Все',
      type: 'grid'
    },
    fields: [{ id: 'fld-files', name: 'Файлы', type: 'Attachment' }],
    preview: {
      items: [
        {
          recordId: 'rec-attachment-empty-1',
          fields: {
            'fld-files': []
          }
        }
      ],
      pageNum: 1,
      pageSize: 20,
      total: 1
    },
    total: 1,
    capabilities: {
      canInlineEdit: true,
      canCreateRecords: true,
      canDeleteRecords: true
    },
    openInMwsUrl: 'https://tables.mws.ru/fusion/v1/mock'
  }
};

describe('MwsTableEmbedComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(wikiliveApi.resolveTableEmbed).mockResolvedValue(
      RESOLVE_TABLE_EMBED_MOCK
    );
    vi.mocked(wikiliveApi.createMwsRecords).mockResolvedValue({ items: [] });
    vi.mocked(wikiliveApi.createMwsField).mockResolvedValue({
      field: {
        id: 'fld-created',
        name: 'Новый столбец',
        type: 'SingleText'
      }
    });
    vi.mocked(wikiliveApi.uploadMwsAttachment).mockResolvedValue({
      uploaded: true
    } as never);
  });

  it('renders a populated live table instead of an empty state when preview data arrives', async () => {
    render(
      <MwsTableEmbedComponent
        node={
          {
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
              displayMode: 'table'
            }
          } as never
        }
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
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Таблица 2')).toBeInTheDocument();
      expect(screen.getByText(/1\/1 строк/)).toBeInTheDocument();
    });

    expect(
      screen.queryByText('В выбранном view пока нет строк')
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('mws_canvas_grid')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Открыть в MWS' })).toHaveAttribute(
      'href',
      'https://tables.mws.ru/fusion/v1/mock'
    );
  });

  it('collapses and expands the live table block without losing its summary', async () => {
    render(
      <MwsTableEmbedComponent
        node={
          {
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
              displayMode: 'table'
            }
          } as never
        }
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
      />
    );

    expect(await screen.findByTestId('mws_canvas_grid')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Свернуть' }));

    expect(screen.getByTestId('mws_canvas_grid')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Сортировка' })).not.toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Развернуть' }));

    expect(await screen.findByTestId('mws_canvas_grid')).toBeInTheDocument();
  });

  it('starts inline editing on the first typed key after a cell is selected', async () => {
    render(
      <MwsTableEmbedComponent
        node={
          {
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
              displayMode: 'table'
            }
          } as never
        }
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
      />
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
      toJSON: () => ({})
    });

    fireEvent.pointerDown(canvas, { clientX: 80, clientY: 60 });
    fireEvent.keyDown(canvas, { key: 'A' });

    const editorInput = await screen.findByDisplayValue('A');
    expect(editorInput).toBeInTheDocument();
  });

  it('opens select dropdown on cell click and updates record when option is chosen', async () => {
    vi.mocked(wikiliveApi.resolveTableEmbed).mockResolvedValueOnce(
      RESOLVE_SELECT_TABLE_EMBED_MOCK
    );
    vi.mocked(wikiliveApi.updateMwsRecords).mockResolvedValue({ items: [] });

    render(
      <MwsTableEmbedComponent
        node={
          {
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
              displayMode: 'table'
            }
          } as never
        }
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
      />
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
      toJSON: () => ({})
    });

    fireEvent.pointerDown(canvas, { clientX: 80, clientY: 60 });

    expect(await screen.findByTestId('mws_select_editor')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /В работе/i }));

    await waitFor(() => {
      expect(wikiliveApi.updateMwsRecords).toHaveBeenCalledWith('dst-select', {
        fieldKey: 'id',
        records: [
          { recordId: 'rec-status-1', fields: { 'fld-status': 'В работе' } }
        ]
      });
    });
  });

  it('opens the sort modal from the toolbar', async () => {
    render(
      <MwsTableEmbedComponent
        node={
          {
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
              displayMode: 'table'
            }
          } as never
        }
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
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Сортировка' }));
    expect(
      await screen.findByRole('dialog', { name: 'Сортировка' })
    ).toBeInTheDocument();
  });

  it('opens the filter modal from the toolbar', async () => {
    render(
      <MwsTableEmbedComponent
        node={
          {
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
              displayMode: 'table'
            }
          } as never
        }
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
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Фильтр' }));
    expect(
      await screen.findByRole('dialog', { name: /Фильтры по данным/i })
    ).toBeInTheDocument();
  });

  it('opens the group modal from the toolbar', async () => {
    render(
      <MwsTableEmbedComponent
        node={
          {
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
              displayMode: 'table'
            }
          } as never
        }
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
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Группа' }));
    expect(
      await screen.findByRole('dialog', { name: /Группировка по полю/i })
    ).toBeInTheDocument();
  });

  it('reuses the action bar in expanded mode and renders the fullscreen grid', async () => {
    render(
      <MwsTableEmbedComponent
        node={
          {
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
              displayMode: 'table'
            }
          } as never
        }
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
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Раскрыть' }));

    expect(
      await screen.findByText('Полноэкранный просмотр')
    ).toBeInTheDocument();
    const dialog = screen.getByRole('dialog', {
      name: /Полноэкранная таблица Таблица 2/i
    });
    expect(
      within(dialog).getByTestId('mws_canvas_grid_expanded')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('mws_canvas_grid')).not.toBeInTheDocument();
    expect(
      within(dialog).getAllByRole('button', { name: 'Скрыть поля' })
    ).toHaveLength(1);
    expect(
      within(dialog).getByRole('button', { name: 'Закрыть' })
    ).toBeInTheDocument();
  });

  it('keeps fullscreen open when clicking inside the table dialog', async () => {
    render(
      <MwsTableEmbedComponent
        node={
          {
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
              displayMode: 'table'
            }
          } as never
        }
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
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Раскрыть' }));
    const dialog = screen.getByRole('dialog', {
      name: /Полноэкранная таблица Таблица 2/i
    });

    fireEvent.click(within(dialog).getByText('Полноэкранный просмотр'));

    expect(
      screen.getByRole('dialog', { name: /Полноэкранная таблица Таблица 2/i })
    ).toBeInTheDocument();
  });

  it('shows attachment widget near the selected cell and allows closing it', async () => {
    vi.mocked(wikiliveApi.resolveTableEmbed).mockResolvedValueOnce(
      RESOLVE_ATTACHMENT_TABLE_EMBED_MOCK
    );

    render(
      <MwsTableEmbedComponent
        node={
          {
            attrs: {
              blockId: 'block-attachment-1',
              title: 'Таблица вложений',
              spaceId: 'space-1',
              nodeId: 'node-attachment',
              datasheetId: 'dst-attachment',
              viewId: 'view-main',
              selectedFieldIds: ['fld-files'],
              pageSize: 20,
              allowInlineEdit: true,
              displayMode: 'table'
            }
          } as never
        }
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
      />
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
      toJSON: () => ({})
    });

    fireEvent.pointerDown(canvas, { clientX: 80, clientY: 60 });

    const widget = await screen.findByTestId('mws_attachment_widget');
    expect(within(widget).getByText('Скриншот.png')).toBeInTheDocument();

    fireEvent.click(
      within(widget).getByRole('button', { name: 'Закрыть виджет вложений' })
    );

    expect(
      screen.queryByTestId('mws_attachment_widget')
    ).not.toBeInTheDocument();
  });

  it('opens upload modal from an empty attachment cell widget', async () => {
    vi.mocked(wikiliveApi.resolveTableEmbed).mockResolvedValueOnce(
      RESOLVE_EMPTY_ATTACHMENT_TABLE_EMBED_MOCK
    );

    render(
      <MwsTableEmbedComponent
        node={
          {
            attrs: {
              blockId: 'block-attachment-empty-1',
              title: 'Таблица пустых вложений',
              spaceId: 'space-1',
              nodeId: 'node-attachment-empty',
              datasheetId: 'dst-attachment-empty',
              viewId: 'view-main',
              selectedFieldIds: ['fld-files'],
              pageSize: 20,
              allowInlineEdit: true,
              displayMode: 'table'
            }
          } as never
        }
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
      />
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
      toJSON: () => ({})
    });

    fireEvent.pointerDown(canvas, { clientX: 80, clientY: 60 });

    const widget = await screen.findByTestId('mws_attachment_widget');
    fireEvent.click(
      within(widget).getByRole('button', { name: 'Загрузить файл' })
    );

    expect(
      await screen.findByRole('dialog', { name: 'Добавить файлы' })
    ).toBeInTheDocument();
  });

  it('uploads multiple files from attachment modal', async () => {
    vi.mocked(wikiliveApi.resolveTableEmbed).mockResolvedValueOnce(
      RESOLVE_ATTACHMENT_TABLE_EMBED_MOCK
    );

    render(
      <MwsTableEmbedComponent
        node={
          {
            attrs: {
              blockId: 'block-attachment-1',
              title: 'Таблица вложений',
              spaceId: 'space-1',
              nodeId: 'node-attachment',
              datasheetId: 'dst-attachment',
              viewId: 'view-main',
              selectedFieldIds: ['fld-files'],
              pageSize: 20,
              allowInlineEdit: true,
              displayMode: 'table'
            }
          } as never
        }
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
      />
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
      toJSON: () => ({})
    });

    fireEvent.pointerDown(canvas, { clientX: 80, clientY: 60 });

    const widget = await screen.findByTestId('mws_attachment_widget');
    fireEvent.click(
      within(widget).getByRole('button', { name: 'Добавить файл' })
    );

    const dialog = await screen.findByRole('dialog', {
      name: 'Добавить файлы'
    });
    const input = within(dialog).getByLabelText(
      /добавить файлы/i
    ) as HTMLInputElement;
    const fileA = new File(['a'], 'one.txt', { type: 'text/plain' });
    const fileB = new File(['b'], 'two.txt', { type: 'text/plain' });

    fireEvent.change(input, { target: { files: [fileA, fileB] } });

    expect(within(dialog).getByText('one.txt')).toBeInTheDocument();
    expect(within(dialog).getByText('two.txt')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Загрузить' }));

    await waitFor(() => {
      expect(wikiliveApi.uploadMwsAttachment).toHaveBeenCalledTimes(2);
    });
  });

  it('opens create column modal from the plus area in the header', async () => {
    render(
      <MwsTableEmbedComponent
        node={
          {
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
              displayMode: 'table'
            }
          } as never
        }
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
      />
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
      toJSON: () => ({})
    });

    fireEvent.pointerDown(canvas, { clientX: 260, clientY: 20 });

    expect(
      await screen.findByRole('dialog', { name: /Добавить столбец/i })
    ).toBeInTheDocument();
  });

  it('opens a field action menu from the header and routes filtering to client controls', async () => {
    render(
      <MwsTableEmbedComponent
        node={
          {
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
              displayMode: 'table'
            }
          } as never
        }
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
      />
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
      toJSON: () => ({})
    });

    fireEvent.pointerDown(canvas, { clientX: 80, clientY: 20 });

    expect(
      await screen.findByRole('menu', { name: /Действия для поля Название/i })
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /Добавить "Название" как фильтр/i })
    );

    expect(
      await screen.findByRole('dialog', { name: /Фильтры по данным/i })
    ).toBeInTheDocument();
  });

  it('adds a row optimistically from the plus area below the last row', async () => {
    let resolveCreate:
      | ((value: {
          items: Array<{ recordId: string; fields: Record<string, unknown> }>;
        }) => void)
      | undefined;
    vi.mocked(wikiliveApi.createMwsRecords).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }) as ReturnType<typeof wikiliveApi.createMwsRecords>
    );

    render(
      <MwsTableEmbedComponent
        node={
          {
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
              displayMode: 'table'
            }
          } as never
        }
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
      />
    );

    expect(await screen.findByText(/1\/1 строк/)).toBeInTheDocument();

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
      toJSON: () => ({})
    });

    fireEvent.pointerDown(canvas, { clientX: 20, clientY: 95 });

    expect(screen.getByText(/2\/2 строк/)).toBeInTheDocument();
    expect(wikiliveApi.createMwsRecords).toHaveBeenCalledWith('dst-2', {
      fieldKey: 'id',
      records: [{ fields: { 'fld-title': '' } }]
    });

    if (resolveCreate) {
      resolveCreate({
        items: [{ recordId: 'rec-2', fields: { 'fld-title': '' } }]
      });
    }

    await waitFor(() => {
      expect(screen.getByText(/2\/2 строк/)).toBeInTheDocument();
    });
  });
});
