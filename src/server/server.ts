import * as http from "http";
import { handle } from "./routes";
import { SseHub } from "./sse";
import { startWatcher } from "./watcher";
import { clearPid } from "./pid";

export interface ServerHandles {
  close(): Promise<void>;
}

export async function startServer(opts: {
  repoRoot: string;
  port: number;
}): Promise<ServerHandles> {
  const hub = new SseHub();
  const watcher = startWatcher(opts.repoRoot, hub);

  const server = http.createServer(async (req, res) => {
    try {
      await handle(req, res, { repoRoot: opts.repoRoot, hub });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      try {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: msg }));
      } catch {
        // already sent headers
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  const cleanup = async () => {
    hub.shutdown();
    await watcher.close();
    await new Promise<void>((r) => server.close(() => r()));
    clearPid(opts.repoRoot);
  };

  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.once(sig, () => {
      cleanup().finally(() => process.exit(0));
    });
  }

  return { close: cleanup };
}
