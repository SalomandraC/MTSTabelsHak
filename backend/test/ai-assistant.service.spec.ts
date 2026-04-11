import { AiAssistantService } from '../src/ai-tools/ai-assistant.service';

describe('AiAssistantService', () => {
  const aiProviderClientService = {
    complete: jest.fn(),
  };

  const service = new AiAssistantService(aiProviderClientService as any);

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

    const result = await service.transformText('rewrite me', 'professional', {
      pageTitle: 'Policy doc',
    });

    expect(result.text).toBe('Professional rewrite');

    const request = aiProviderClientService.complete.mock.calls[0][0];
    expect(request.messages[0].content).toContain('professional, enterprise tone');
    expect(request.messages[1].content).toContain('Transformation: professional');
    expect(request.messages[1].content).toContain('rewrite me');
  });
});