import { AiAssistantService } from '../src/ai-tools/ai-assistant.service';

describe('AiAssistantService', () => {
  const aiProviderClientService = {
    complete: jest.fn(),
  };

  const configService = {
    get: jest.fn((key: string, fallback: string) => {
      const values: Record<string, string> = {
        AI_MODEL_CHAT: 'qwen2.5-72b-instruct',
        AI_MODEL_MUTATION: 'qwen2.5-72b-instruct',
        AI_MODEL_WRITER: 'llama-3.3-70b-instruct',
        AI_MODEL_FAST: 'llama-3.1-8b-instruct',
      };

      return values[key] ?? fallback;
    }),
  };

  const service = new AiAssistantService(aiProviderClientService as any, configService as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds a ghost-text prompt for completion', async () => {
    aiProviderClientService.complete.mockResolvedValueOnce({
      choices: [{ message: { content: 'continue the sentence' } }],
    });

    const result = await service.getCompletion('Current sentence', {
      pageTitle: 'Demo page',
    });

    expect(result.text).toBe('continue the sentence');
    expect(aiProviderClientService.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'llama-3.1-8b-instruct',
        temperature: 0.25,
        maxTokens: 96,
      }),
    );

    const request = aiProviderClientService.complete.mock.calls[0][0];
    expect(request.messages[0].content).toContain('ghost-text assistant');
    expect(request.messages[1].content).toContain('Current sentence');
    expect(request.messages[1].content).toContain('Page title: Demo page');
  });

  it('requests JSON output for content generation', async () => {
    aiProviderClientService.complete.mockResolvedValueOnce({
      choices: [{ message: { content: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello"}]}]}' } }],
    });

    const result = await service.generateContent('Write an intro', {
      pageSnapshot: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Context' }] }],
      },
    });

    expect(result.document.type).toBe('doc');
    expect(result.document.content).toHaveLength(1);

    const request = aiProviderClientService.complete.mock.calls[0][0];
    expect(request.responseFormat).toBe('json_object');
    expect(request.messages[0].content).toContain('You generate ProseMirror JSON');
    expect(request.messages[1].content).toContain('Generation prompt');
    expect(request.messages[1].content).toContain('Context');
  });

  it('uses style prompts for text transformations', async () => {
    aiProviderClientService.complete.mockResolvedValueOnce({
      choices: [{ message: { content: 'Professional rewrite' } }],
    });

    const result = await service.transformText('rewrite me', 'professional', 'business', {
      pageTitle: 'Policy doc',
    });

    expect(result.text).toBe('Professional rewrite');

    const request = aiProviderClientService.complete.mock.calls[0][0];
    expect(request.messages[0].content).toContain('business style suitable for enterprise communication');
    expect(request.messages[1].content).toContain('Transformation: professional');
    expect(request.messages[1].content).toContain('style: business');
    expect(request.messages[1].content).toContain('rewrite me');
  });

  it('uses church style prompt with biblical cadence guidance', async () => {
    aiProviderClientService.complete.mockResolvedValueOnce({
      choices: [{ message: { content: 'Ибо сказано: поступай мудро.' } }],
    });

    const result = await service.transformText('действуй разумно', 'professional', 'church');

    expect(result.text).toBe('Ибо сказано: поступай мудро.');

    const request = aiProviderClientService.complete.mock.calls[0][0];
    expect(request.messages[0].content).toContain('biblical cadence');
    expect(request.messages[0].content).toContain('"ибо сказано"');
    expect(request.messages[0].content).toContain('Do not fabricate real scripture references.');
    expect(request.messages[1].content).toContain('style: church');
  });

  it('includes strict output rules for selected fragment transform', () => {
    const messages = service.buildTransformMessages('Тестовый текст', 'professional', 'business');

    expect(messages[0].content).toContain('Return only the transformed selected fragment text');
    expect(messages[0].content).toContain('Do not output labels or metadata');
    expect(messages[0].content).toContain('Do not add markdown tables, separators, or horizontal rules');
  });

  it('sanitizes leaked metadata and horizontal rules in transform output', async () => {
    aiProviderClientService.complete.mockResolvedValueOnce({
      choices: [{ message: { content: 'Page title: Wiki: Новая таблица\n---\nПереработанный вариант\nОбновленный текст' } }],
    });

    const result = await service.transformText('Исходный текст без линий', 'professional', 'business');

    expect(result.text).toBe('Обновленный текст');
  });
});