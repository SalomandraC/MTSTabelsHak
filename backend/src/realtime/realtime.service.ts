import { Injectable, Logger } from '@nestjs/common';
import type { Server as HttpServer, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

type SpaceRealtimeEvent =
  | {
      type: 'page_access_updated';
      spaceId: string;
      pageId: string;
    }
  | {
      type: 'page_updated';
      spaceId: string;
      pageId: string;
    };

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly clientsBySpace = new Map<string, Set<WebSocket>>();
  private server?: WebSocketServer;

  setup(httpServer: HttpServer): void {
    if (this.server) {
      return;
    }

    this.server = new WebSocketServer({ noServer: true });

    this.server.on('connection', (socket: WebSocket, request: IncomingMessage) => {
      const spaceId = this.readSpaceId(request);
      if (!spaceId) {
        socket.close(1008, 'spaceId is required');
        return;
      }

      this.registerClient(spaceId, socket);
      socket.send(JSON.stringify({ type: 'connected', spaceId }));
    });

    httpServer.on('upgrade', (request, socket, head) => {
      const pathname = this.readPathname(request);
      if (pathname !== '/api/v1/realtime') {
        return;
      }

      this.server?.handleUpgrade(request, socket, head, (ws: WebSocket) => {
        this.server?.emit('connection', ws, request);
      });
    });
  }

  broadcastPageAccessUpdated(spaceId: string, pageId: string): void {
    this.broadcast(spaceId, {
      type: 'page_access_updated',
      spaceId,
      pageId,
    });
  }

  broadcastPageUpdated(spaceId: string, pageId: string): void {
    this.broadcast(spaceId, {
      type: 'page_updated',
      spaceId,
      pageId,
    });
  }

  private broadcast(spaceId: string, payload: SpaceRealtimeEvent): void {
    const clients = this.clientsBySpace.get(spaceId);
    if (!clients || clients.size === 0) {
      return;
    }

    const message = JSON.stringify(payload);
    for (const client of clients) {
      if (client.readyState !== WebSocket.OPEN) {
        clients.delete(client);
        continue;
      }

      client.send(message);
    }
  }

  private registerClient(spaceId: string, socket: WebSocket): void {
    const clients = this.clientsBySpace.get(spaceId) ?? new Set<WebSocket>();
    clients.add(socket);
    this.clientsBySpace.set(spaceId, clients);

    socket.on('close', () => {
      const current = this.clientsBySpace.get(spaceId);
      if (!current) {
        return;
      }

      current.delete(socket);
      if (current.size === 0) {
        this.clientsBySpace.delete(spaceId);
      }
    });
  }

  private readPathname(request: IncomingMessage): string | null {
    if (!request.url) {
      return null;
    }

    return new URL(request.url, 'http://localhost').pathname;
  }

  private readSpaceId(request: IncomingMessage): string | null {
    if (!request.url) {
      return null;
    }

    return new URL(request.url, 'http://localhost').searchParams.get('spaceId');
  }
}
