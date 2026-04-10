import { AiChatService } from '../src/ai-tools/ai-chat.service';

describe('AiChatService', () => {
  const aiProviderClientService = {
    complete: jest.fn(),
  };

  const mwsService = {
    listRecords: jest.fn(),
  };

  const service = new AiChatService(aiProviderClientService as any, mwsService as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('executeTool calls MWS API for table questions', async () => {
    aiProviderClientService.complete.mockResolvedValueOnce({
      choices: [{ message: { content: '' } }],
    });
    mwsService.listRecords.mockResolvedValueOnce({
      items: [{ recordId: 'rec-1', fields: { Название: 'Сделать задачу' } }],
      pageNum: 1,
      pageSize: 20,
      total: 1,
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

    expect(mwsService.listRecords).toHaveBeenCalledWith(
      'dst-1',
      expect.objectContaining({
        fieldKey: 'id',
        viewId: 'viw-1',
        pageSize: 20,
        pageNum: 1,
      }),
      { userId: 'user-1', displayName: 'Tester' },
    );
    expect(result.usedTools[0].toolName).toBe('get_mws_records');
    expect(result.answer).toContain('Вот что есть в таблице');
    expect(result.references).toHaveLength(1);
  });
});