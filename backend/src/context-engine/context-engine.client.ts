import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import type {
  ContextEngineIndexDocumentRequest,
  ContextEngineSearchRequest,
  ContextEngineSearchResponse,
} from './context-engine.types';

@Injectable()
export class ContextEngineClient {
  private readonly logger = new Logger(ContextEngineClient.name);
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>('CONTEXT_ENGINE_URL', 'http://context-engine:8090');
  }

  async healthcheck(): Promise<boolean> {
    try {
      await firstValueFrom(this.httpService.get(`${this.baseUrl}/health`, { timeout: 3000 }));
      return true;
    } catch {
      return false;
    }
  }

  async indexDocument(payload: ContextEngineIndexDocumentRequest): Promise<void> {
    await firstValueFrom(
      this.httpService.post(
        `${this.baseUrl}/index/documents`,
        payload,
        {
          timeout: 20_000,
        },
      ),
    );
  }

  async deleteDocument(pageId: string): Promise<void> {
    await firstValueFrom(
      this.httpService.delete(`${this.baseUrl}/index/documents/${encodeURIComponent(pageId)}`, {
        timeout: 10_000,
      }),
    );
  }

  async search(payload: ContextEngineSearchRequest): Promise<ContextEngineSearchResponse> {
    const response = await firstValueFrom(
      this.httpService.post<ContextEngineSearchResponse>(
        `${this.baseUrl}/search`,
        payload,
        {
          timeout: 20_000,
        },
      ),
    );

    return response.data;
  }

  logUnavailable(error: unknown, operation: string): void {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(`Context engine ${operation} failed: ${message}`);
  }
}
