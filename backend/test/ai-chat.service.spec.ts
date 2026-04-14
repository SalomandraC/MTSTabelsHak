import { AiChatService } from '../src/ai-tools/ai-chat.service';

describe('AiChatService', () => {
  const aiProviderClientService = {
    complete: jest.fn(),
  };

  const aiToolRegistryService = {
    getToolDefinitions: jest.fn(),
    executeTool: jest.fn(),
  };
  const contextSearchService = {
    searchInSpace: jest.fn(),
  };

  const service = new AiChatService(
    aiProviderClientService as any,
    aiToolRegistryService as any,
    contextSearchService as any,
  );

  const toolDefinitions = [
    {
      type: 'function',
      function: {
        name: 'get_records',
        description: 'Read rows from MWS',
        parameters: {},
      },
    },
    {
      type: 'function',
      function: {
        name: 'search_workspace_documents',
        description: 'Search documents in workspace',
        parameters: {},
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_document_context',
        description: 'Read a document context',
        parameters: {},
      },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    aiToolRegistryService.getToolDefinitions.mockReturnValue(toolDefinitions);
    contextSearchService.searchInSpace.mockResolvedValue({ items: [] });
  });

  it('executes MWS tool calls and returns the final model answer', async () => {
    aiProviderClientService.complete
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: '',
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: {
                    name: 'get_records',
                    arguments: JSON.stringify({
                      datasheetId: 'dst-1',
                      viewId: 'viw-1',
                      pageSize: 20,
                      pageNum: 1,
                      fieldKey: 'id',
                    }),
                  },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'В таблице 1 задача: Сделать задачу' } }],
      });

    aiToolRegistryService.executeTool.mockResolvedValueOnce({
      ok: true,
      toolName: 'get_records',
      data: {
        items: [{ recordId: 'rec-1', fields: { Название: 'Сделать задачу' } }],
        pageNum: 1,
        pageSize: 20,
        total: 1,
      },
      canonicalRecords: [{ recordId: 'rec-1', fields: { Название: 'Сделать задачу' } }],
    });

    const result = await service.askQuestion(
      {
        question: 'Какие задачи в таблице?',
        datasheetId: 'dst-1',
        viewId: 'viw-1',
        pageSnapshot: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Заметка' }] }],
        },
      },
      { userId: 'user-1', displayName: 'Tester' },
    );

    expect(aiToolRegistryService.executeTool).toHaveBeenCalledWith(
      'get_records',
      expect.objectContaining({
        datasheetId: 'dst-1',
        viewId: 'viw-1',
        pageSize: 20,
        pageNum: 1,
      }),
      { userId: 'user-1', displayName: 'Tester' },
      { pageId: undefined },
    );
    expect(result.usedTools[0].toolName).toBe('get_records');
    expect(result.answer).toBe('В таблице 1 задача: Сделать задачу');
    expect(result.references).toHaveLength(1);
    expect(aiProviderClientService.complete).toHaveBeenCalledTimes(2);
  });

  it('executeTool delegates to registry service', async () => {
    aiToolRegistryService.executeTool.mockResolvedValueOnce({
      ok: true,
      toolName: 'get_records',
      data: { items: [], pageNum: 1, pageSize: 20, total: 0 },
    });

    await service.executeTool(
      'get_records',
      {
        datasheetId: 'dst-1',
      },
      { userId: 'user-1', displayName: 'Tester' },
    );

    expect(aiToolRegistryService.executeTool).toHaveBeenCalledWith(
      'get_records',
      { datasheetId: 'dst-1' },
      { userId: 'user-1', displayName: 'Tester' },
      { pageId: undefined },
    );
  });

  it('uses document context without table tools for non-table questions', async () => {
    aiProviderClientService.complete.mockResolvedValueOnce({
      choices: [{ message: { content: 'Архитектура' } }],
    });

    const result = await service.askQuestion(
      {
        question: 'Про что этот текст одним словом?',
        spaceId: 'space-1',
        pageId: 'page-1',
        pageSnapshot: 'Сервис описывает архитектуру векторного поиска и индексации документов.',
      },
      { userId: 'user-1', displayName: 'Tester' },
    );

    expect(contextSearchService.searchInSpace).toHaveBeenCalledWith(
      { userId: 'user-1', displayName: 'Tester' },
      {
        spaceId: 'space-1',
        query: 'Про что этот текст одним словом?',
        pageIds: undefined,
        folderIds: undefined,
        topK: 5,
      },
    );
    expect(aiProviderClientService.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [],
        toolChoice: 'none',
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('Page context:\nСервис описывает архитектуру векторного поиска и индексации документов.'),
          }),
        ]),
      }),
    );
    expect(result.answer).toBe('Архитектура');
  });

  it('uses workspace tools in space scope before answering', async () => {
    aiProviderClientService.complete
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: '',
              tool_calls: [
                {
                  id: 'call-search',
                  type: 'function',
                  function: {
                    name: 'search_workspace_documents',
                    arguments: JSON.stringify({
                      spaceId: 'space-1',
                      query: 'релизные заметки интеграции',
                    }),
                  },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: '',
              tool_calls: [
                {
                  id: 'call-doc',
                  type: 'function',
                  function: {
                    name: 'get_document_context',
                    arguments: JSON.stringify({
                      pageId: 'page-42',
                    }),
                  },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Интеграция' } }],
      });

    aiToolRegistryService.executeTool
      .mockResolvedValueOnce({
        ok: true,
        toolName: 'search_workspace_documents',
        data: {
          items: [{ pageId: 'page-42', title: 'Релизные заметки', snippet: 'Интеграция с MWS', score: 0.91 }],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        toolName: 'get_document_context',
        data: {
          pageId: 'page-42',
          title: 'Релизные заметки',
          content: 'Документ посвящен интеграции с MWS и новым поисковым агентам.',
        },
      });

    const result = await service.askQuestion(
      {
        question: 'Как одним словом описать это пространство?',
        spaceId: 'space-1',
        contextScope: 'space',
        workspaceStructure: {
          scope: 'space',
          spaceId: 'space-1',
          nodes: [
            { id: 'folder-1', title: 'Релизы', kind: 'wikiFolder', parentId: null, depth: 0 },
            { id: 'page-42', title: 'Релизные заметки', kind: 'wikiPage', parentId: 'folder-1', depth: 1 },
          ],
        },
      },
      { userId: 'user-1', displayName: 'Tester' },
    );

    expect(aiProviderClientService.complete).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        toolChoice: 'auto',
        tools: expect.arrayContaining([
          expect.objectContaining({ function: expect.objectContaining({ name: 'search_workspace_documents' }) }),
          expect.objectContaining({ function: expect.objectContaining({ name: 'get_document_context' }) }),
        ]),
      }),
    );
    expect(aiToolRegistryService.executeTool).toHaveBeenNthCalledWith(
      1,
      'search_workspace_documents',
      {
        spaceId: 'space-1',
        query: 'релизные заметки интеграции',
      },
      { userId: 'user-1', displayName: 'Tester' },
      { pageId: undefined },
    );
    expect(aiToolRegistryService.executeTool).toHaveBeenNthCalledWith(
      2,
      'get_document_context',
      {
        pageId: 'page-42',
      },
      { userId: 'user-1', displayName: 'Tester' },
      { pageId: undefined },
    );
    expect(result.answer).toBe('Интеграция');
    expect(result.usedTools.map((item) => item.toolName)).toEqual([
      'search_workspace_documents',
      'get_document_context',
    ]);
  });
});
