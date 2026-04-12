declare module 'ws' {
  export class WebSocketServer {
    constructor(options?: any);
    on(event: string, listener: (...args: any[]) => void): this;
    handleUpgrade(request: any, socket: any, head: any, callback: (socket: WebSocket) => void): void;
    emit(event: string, ...args: any[]): boolean;
  }

  export class WebSocket {
    static readonly OPEN: number;
    readonly readyState: number;
    on(event: string, listener: (...args: any[]) => void): this;
    send(data: string): void;
    close(code?: number, reason?: string): void;
  }
}
