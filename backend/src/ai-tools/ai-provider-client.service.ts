import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export type AiChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface AiChatMessage {
  role: AiChatRole;
  content?: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: AiToolCall[];
}

export interface AiToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface AiChatChoice {
  message: {
    content?: string | null;
    tool_calls?: AiToolCall[];
  };
}

export interface AiChatResponse {
  choices?: AiChatChoice[];
}

export interface AiChatRequest {
  messages: AiChatMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json_object' | 'text';
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  toolChoice?: 'auto' | 'none';
  stream?: boolean;
}

@Injectable()
export class AiProviderClientService {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly model: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>('MWS_AI_BASE_URL', 'https://api.gpt.mws.ru/v1');
    this.apiKey =
      this.configService.get<string>('MWS_AI_TOKEN') ??
      this.configService.get<string>('AI_PROVIDER_API_KEY') ??
      undefined;
    this.model = this.configService.get<string>('MWS_AI_MODEL', 'kimi-k2-instruct');
  }

  async complete(request: AiChatRequest): Promise<AiChatResponse> {
    if (!this.apiKey) {
      throw new InternalServerErrorException('MWS_AI_TOKEN is required');
    }

    const response = await firstValueFrom(
      this.httpService.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: request.messages,
          temperature: request.temperature ?? 0.2,
          max_tokens: request.maxTokens ?? 256,
          response_format: request.responseFormat === 'json_object' ? { type: 'json_object' } : undefined,
          tools: request.tools,
          tool_choice: request.toolChoice,
          stream: Boolean(request.stream),
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      ),
    );

    return response.data as AiChatResponse;
  }
}