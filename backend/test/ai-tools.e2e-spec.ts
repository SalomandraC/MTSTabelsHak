import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AiToolsController } from '../src/ai-tools/ai-tools.controller';
import { AiToolRegistryService } from '../src/ai-tools/ai-tool-registry.service';
import { AiAssistantService } from '../src/ai-tools/ai-assistant.service';
import { AiChatService } from '../src/ai-tools/ai-chat.service';

describe('AiToolsController (e2e)', () => {
  let app: INestApplication;

  const aiToolRegistryService = {
    getToolDefinitions: jest.fn().mockReturnValue([]),
    executeTool: jest.fn(),
  };

  const aiAssistantService = {
    getCompletion: jest.fn(),
    generateContent: jest.fn(),
    transformText: jest.fn(),
  };

  const aiChatService = {
    askQuestion: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AiToolsController],
      providers: [
        { provide: AiToolRegistryService, useValue: aiToolRegistryService },
        { provide: AiAssistantService, useValue: aiAssistantService },
        { provide: AiChatService, useValue: aiChatService },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns valid JSON from /api/v1/ai/generate', async () => {
    aiAssistantService.generateContent.mockResolvedValueOnce({
      document: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Generated content' }],
          },
        ],
      },
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/ai/generate')
      .send({ prompt: 'Write a short intro' })
      .expect(201);

    expect(response.body.document.type).toBe('doc');
    expect(Array.isArray(response.body.document.content)).toBe(true);
    expect(() => JSON.stringify(response.body.document)).not.toThrow();
  });
});