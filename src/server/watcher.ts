import * as path from "path";
import chokidar, { FSWatcher } from "chokidar";
import { reviewsDir } from "../review/storage";
import { SseHub } from "./sse";

export function startWatcher(repoRoot: string, hub: SseHub): FSWatcher {
  const dir = reviewsDir(repoRoot);
  const watcher = chokidar.watch(path.join(dir, "*.json"), {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
  });

  watcher.on("add", (p) =>
    hub.broadcast({ type: "review.added", data: { file: path.basename(p) } }),
  );
  watcher.on("change", (p) =>
    hub.broadcast({ type: "review.changed", data: { file: path.basename(p) } }),
  );
  watcher.on("unlink", (p) =>
    hub.broadcast({ type: "review.removed", data: { file: path.basename(p) } }),
  );

  return watcher;
}
