import { AiChatService } from '../src/ai-tools/ai-chat.service';

describe('AiChatService', () => {
  const aiProviderClientService = {
    complete: jest.fn(),
  };

  const aiToolRegistryService = {
    getToolDefinitions: jest.fn(),
    executeTool: jest.fn(),
  };

  const aiAssistantService = {
    resolveModelForIntent: jest.fn().mockReturnValue('qwen2.5-72b-instruct'),
  };

  const service = new AiChatService(
    aiProviderClientService as any,
    aiToolRegistryService as any,
    aiAssistantService as any,
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
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    aiToolRegistryService.getToolDefinitions.mockReturnValue(toolDefinitions);
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
});