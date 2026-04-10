import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server } from '@hocuspocus/server';
import * as Y from 'yjs';
import { AuthService } from 'src/auth/auth.service';
import { RedisService } from 'src/infra/redis/redis.service';
import { CollabPersistenceService } from './collab-persistence.service';
import { CollabService } from './collab.service';

@Injectable()
export class HocuspocusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HocuspocusService.name);
  private server?: Server;

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly redisService: RedisService,
    private readonly collabService: CollabService,
    private readonly persistenceService: CollabPersistenceService,
  ) {}

  async onModuleInit(): Promise<void> {
    const port = Number(this.configService.get<string>('COLLAB_PORT', '8081'));

    this.server = new Server({
      port,
      debounce: 10000,
      maxDebounce: 10000,
      quiet: false,
      onAuthenticate: async (data: any) => {
        const payload = this.authService.verifyCollabToken(data.token);
        if (payload.pageId !== data.documentName) {
          throw new Error('Collaboration token does not match document');
        }

        data.context = {
          sessionId: payload.sessionId,
          clientId: payload.clientId,
          userId: payload.sub,
          displayName: (payload as any).displayName ?? `User ${payload.sub.slice(0, 6)}`,
        };
      },
      onLoadDocument: async (data: any) => {
        return this.persistenceService.loadDocument(data.documentName);
      },
      onConnect: async (data: any) => {
        const context = data.connection.readOnly ? undefined : data.context;
        if (context?.userId) {
          await this.redisService.sadd(
            this.collabService.presenceKey(data.documentName),
            JSON.stringify({
              userId: context.userId,
              displayName: context.displayName,
            }),
            60,
          );
        }
      },
      onChange: async (data: any) => {
        const update = data.update as Uint8Array | undefined;
        if (!update) {
          return;
        }

        await this.persistenceService.appendUpdate(data.documentName, update, data.context);
      },
      onStoreDocument: async (data: any) => {
        const document = data.document as Y.Doc;
        await this.persistenceService.storeDocument(data.documentName, document);
      },
      onDisconnect: async (data: any) => {
        if (data.context?.sessionId) {
          this.logger.debug(`Disconnected collaboration session ${data.context.sessionId}`);
        }
      },
    } as any);

    await this.server.listen();
    this.logger.log(`Hocuspocus collaboration server listening on port ${port}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.server?.destroy();
  }
}
