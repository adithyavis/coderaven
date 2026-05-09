import { ServerResponse } from "http";

export interface SseEvent {
  type: string;
  data: unknown;
}

export class SseHub {
  private clients = new Set<ServerResponse>();
  private heartbeat: NodeJS.Timeout;

  constructor() {
    this.heartbeat = setInterval(() => {
      for (const c of this.clients) {
        try {
          c.write(`: keepalive\n\n`);
        } catch {
          this.clients.delete(c);
        }
      }
    }, 20_000);
  }

  attach(res: ServerResponse): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(`: connected\n\n`);
    this.clients.add(res);
    res.on("close", () => this.clients.delete(res));
  }

  broadcast(evt: SseEvent): void {
    const payload = `event: ${evt.type}\ndata: ${JSON.stringify(evt.data)}\n\n`;
    for (const c of this.clients) {
      try {
        c.write(payload);
      } catch {
        this.clients.delete(c);
      }
    }
  }

  shutdown(): void {
    clearInterval(this.heartbeat);
    for (const c of this.clients) {
      try {
        c.end();
      } catch {
        // ignore
      }
    }
    this.clients.clear();
  }
}
